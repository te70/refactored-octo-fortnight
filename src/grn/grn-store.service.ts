import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierResponseDto,
  CreateGrnDto,
  UpdateGrnDto,
  GrnResponseDto,
  ApproveGrnDto,
  RejectGrnDto,
  CreateStoreIssueDto,
  ApproveStoreIssueDto,
  StoreIssueResponseDto,
  StockValuationDto,
  SupplierPerformanceDto,
} from './dto/grn-store.dto';
import { Division, StockMovementType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class GrnStoreService {
  constructor(private prisma: PrismaService) {}

  // ==================== SUPPLIERS ====================

  async createSupplier(
    createSupplierDto: CreateSupplierDto,
    userId: string,
  ): Promise<SupplierResponseDto> {
    const supplier = await this.prisma.supplier.create({
      data: createSupplierDto,
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        tableName: 'suppliers',
        recordId: supplier.id,
        afterJson: {
          name: supplier.name,
          category: supplier.category,
        },
      },
    });

    return this.formatSupplierResponse(supplier);
  }

  async getAllSuppliers(): Promise<SupplierResponseDto[]> {
    const suppliers = await this.prisma.supplier.findMany({
      include: {
        grns: {
          where: {
            status: 'APPROVED',
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return suppliers.map((s) => {
      const totalValue = s.grns.reduce((sum, grn) => sum + Number(grn.totalValue), 0);
      return {
        ...this.formatSupplierResponse(s),
        totalGrns: s.grns.length,
        totalValue: Number(totalValue.toFixed(2)),
      };
    });
  }

  async getSupplierById(id: string): Promise<SupplierResponseDto> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        grns: true,
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const totalValue = supplier.grns.reduce((sum, grn) => sum + Number(grn.totalValue), 0);

    return {
      ...this.formatSupplierResponse(supplier),
      totalGrns: supplier.grns.length,
      totalValue: Number(totalValue.toFixed(2)),
    };
  }

  async updateSupplier(
    id: string,
    updateSupplierDto: UpdateSupplierDto,
    userId: string,
  ): Promise<SupplierResponseDto> {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Supplier not found');
    }

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: updateSupplierDto,
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        tableName: 'suppliers',
        recordId: id,
        beforeJson: {
          name: existing.name,
          contact: existing.contact,
        },
        afterJson: {
          name: updated.name,
          contact: updated.contact,
        },
      },
    });

    return this.formatSupplierResponse(updated);
  }

  // ==================== GRNs ====================

  async createGrn(createGrnDto: CreateGrnDto, userId: string): Promise<GrnResponseDto> {
    // Verify supplier exists
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: createGrnDto.supplierId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    // Verify all stock items exist and get their divisions
    const stockItemIds = createGrnDto.lineItems.map((item) => item.stockItemId);
    const stockItems = await this.prisma.stockItem.findMany({
      where: {
        id: { in: stockItemIds },
      },
    });

    if (stockItems.length !== stockItemIds.length) {
      throw new BadRequestException('One or more stock items not found');
    }

    // Check all items are from the same division
    const divisions = new Set(stockItems.map((item) => item.division));
    if (divisions.size > 1) {
      throw new BadRequestException('All stock items must be from the same division');
    }

    const division = stockItems[0].division;

    // Generate GRN number
    const grnCount = await this.prisma.grn.count();
    const grnNumber = `GRN-${String(grnCount + 1).padStart(6, '0')}`;

    // Calculate total value
    const totalValue = createGrnDto.lineItems.reduce((sum, item) => {
      return sum + item.quantity * item.unitCost;
    }, 0);

    const grn = await this.prisma.$transaction(async (prisma) => {
      // Create GRN
      const newGrn = await prisma.grn.create({
        data: {
          grnNumber,
          supplierId: createGrnDto.supplierId,
          invoiceRef: createGrnDto.invoiceRef,
          deliveryDate: new Date(createGrnDto.deliveryDate),
          totalValue,
          receivedBy: userId,
          status: 'PENDING',
        },
      });

      // Create line items
      await Promise.all(
        createGrnDto.lineItems.map((item) => {
          const lineTotal = item.quantity * item.unitCost;
          return prisma.grnLineItem.create({
            data: {
              grnId: newGrn.id,
              stockItemId: item.stockItemId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              lineTotal,
            },
          });
        }),
      );

      return newGrn;
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        tableName: 'grns',
        recordId: grn.id,
        afterJson: {
          grnNumber: grn.grnNumber,
          supplierId: createGrnDto.supplierId,
          totalValue: totalValue.toString(),
          itemCount: createGrnDto.lineItems.length,
        },
      },
    });

    return this.getGrnById(grn.id);
  }

  async getGrnById(id: string): Promise<GrnResponseDto> {
    const grn = await this.prisma.grn.findUnique({
      where: { id },
      include: {
        supplier: true,
        lineItems: {
          include: {
            stockItem: true,
          },
        },
      },
    });

    if (!grn) {
      throw new NotFoundException('GRN not found');
    }

    return {
      id: grn.id,
      grnNumber: grn.grnNumber,
      supplier: {
        id: grn.supplier.id,
        name: grn.supplier.name,
        category: grn.supplier.category,
      },
      invoiceRef: grn.invoiceRef || undefined,
      deliveryDate: grn.deliveryDate,
      totalValue: Number(grn.totalValue),
      receivedBy: grn.receivedBy,
      approvedBy: grn.approvedBy || undefined,
      status: grn.status,
      lineItems: grn.lineItems.map((item) => ({
        id: item.id,
        stockItem: {
          id: item.stockItem.id,
          name: item.stockItem.name,
          sku: item.stockItem.sku,
          unit: item.stockItem.unit,
        },
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        lineTotal: Number(item.lineTotal),
      })),
      createdAt: grn.createdAt,
    };
  }

  async getAllGrns(
    status?: string,
    supplierId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<GrnResponseDto[]> {
    const grns = await this.prisma.grn.findMany({
      where: {
        ...(status && { status }),
        ...(supplierId && { supplierId }),
        ...(startDate &&
          endDate && {
            deliveryDate: {
              gte: startDate,
              lte: endDate,
            },
          }),
      },
      include: {
        supplier: true,
        lineItems: {
          include: {
            stockItem: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return grns.map((grn) => ({
      id: grn.id,
      grnNumber: grn.grnNumber,
      supplier: {
        id: grn.supplier.id,
        name: grn.supplier.name,
        category: grn.supplier.category,
      },
      invoiceRef: grn.invoiceRef || undefined,
      deliveryDate: grn.deliveryDate,
      totalValue: Number(grn.totalValue),
      receivedBy: grn.receivedBy,
      approvedBy: grn.approvedBy || undefined,
      status: grn.status,
      lineItems: grn.lineItems.map((item) => ({
        id: item.id,
        stockItem: {
          id: item.stockItem.id,
          name: item.stockItem.name,
          sku: item.stockItem.sku,
          unit: item.stockItem.unit,
        },
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        lineTotal: Number(item.lineTotal),
      })),
      createdAt: grn.createdAt,
    }));
  }

  async approveGrn(
    id: string,
    approveGrnDto: ApproveGrnDto,
    userId: string,
  ): Promise<GrnResponseDto> {
    // Verify user PIN
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const pinValid = await bcrypt.compare(approveGrnDto.approverPin, user.pin);
    if (!pinValid) {
      throw new BadRequestException('Invalid PIN');
    }

    // Only Managers and Owners can approve
    if (!['MANAGER', 'OWNER'].includes(user.role)) {
      throw new BadRequestException('Only Managers and Owners can approve GRNs');
    }

    const grn = await this.prisma.grn.findUnique({
      where: { id },
      include: {
        lineItems: {
          include: {
            stockItem: true,
          },
        },
      },
    });

    if (!grn) {
      throw new NotFoundException('GRN not found');
    }

    if (grn.status !== 'PENDING') {
      throw new BadRequestException(`GRN is already ${grn.status}`);
    }

    // Get division from first line item
    const division = grn.lineItems[0].stockItem.division;

    await this.prisma.$transaction(async (prisma) => {
      // Update GRN status
      await prisma.grn.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
        },
      });

      // Create stock movements for each line item
      await Promise.all(
        grn.lineItems.map((item) =>
          prisma.stockMovement.create({
            data: {
              stockItemId: item.stockItemId,
              division,
              movementType: StockMovementType.RECEIVED,
              quantity: item.quantity,
              referenceId: grn.id,
              referenceType: 'GRN',
              notes: `GRN ${grn.grnNumber} approved`,
              createdBy: userId,
            },
          }),
        ),
      );
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'APPROVE_GRN',
        tableName: 'grns',
        recordId: id,
        afterJson: {
          grnNumber: grn.grnNumber,
          status: 'APPROVED',
          totalValue: grn.totalValue.toString(),
        },
      },
    });

    return this.getGrnById(id);
  }

  async rejectGrn(
    id: string,
    rejectGrnDto: RejectGrnDto,
    userId: string,
  ): Promise<GrnResponseDto> {
    // Verify manager PIN
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const pinValid = await bcrypt.compare(rejectGrnDto.managerPin, user.pin);
    if (!pinValid) {
      throw new BadRequestException('Invalid Manager PIN');
    }

    if (!['MANAGER', 'OWNER'].includes(user.role)) {
      throw new BadRequestException('Only Managers and Owners can reject GRNs');
    }

    const grn = await this.prisma.grn.findUnique({ where: { id } });

    if (!grn) {
      throw new NotFoundException('GRN not found');
    }

    if (grn.status !== 'PENDING') {
      throw new BadRequestException(`GRN is already ${grn.status}`);
    }

    const updated = await this.prisma.grn.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy: userId,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'REJECT_GRN',
        tableName: 'grns',
        recordId: id,
        afterJson: {
          grnNumber: grn.grnNumber,
          status: 'REJECTED',
          reason: rejectGrnDto.reason,
        },
      },
    });

    return this.getGrnById(id);
  }

  // ==================== STORE ISSUES (TRANSFERS) ====================

  async createStoreIssue(
    createStoreIssueDto: CreateStoreIssueDto,
    userId: string,
  ): Promise<StoreIssueResponseDto> {
    if (createStoreIssueDto.fromDivision === createStoreIssueDto.toDivision) {
      throw new BadRequestException('Cannot transfer to the same division');
    }

    // Verify all stock items exist and are in the fromDivision
    const stockItemIds = createStoreIssueDto.items.map((item) => item.stockItemId);
    const stockItems = await this.prisma.stockItem.findMany({
      where: {
        id: { in: stockItemIds },
      },
    });

    if (stockItems.length !== stockItemIds.length) {
      throw new BadRequestException('One or more stock items not found');
    }

    const wrongDivisionItems = stockItems.filter(
      (item) => item.division !== createStoreIssueDto.fromDivision,
    );

    if (wrongDivisionItems.length > 0) {
      throw new BadRequestException(
        `Stock items must be from ${createStoreIssueDto.fromDivision} division`,
      );
    }

    // Generate issue number
    const issueCount = await this.prisma.storeIssue.count();
    const issueNumber = `SI-${String(issueCount + 1).padStart(6, '0')}`;

    // Prepare items with stock item details
    const itemsWithDetails = createStoreIssueDto.items.map((item) => {
      const stockItem = stockItems.find((si) => si.id === item.stockItemId);
      
      if (!stockItem) {
        throw new BadRequestException(`Stock item ${item.stockItemId} not found`);
      }
      
      return {
        stockItemId: item.stockItemId,
        stockItemName: stockItem.name,
        stockItemSku: stockItem.sku,
        unit: stockItem.unit,
        quantityRequested: item.quantityRequested,
        quantityIssued: item.quantityIssued || null,
      };
    });

    const storeIssue = await this.prisma.storeIssue.create({
      data: {
        issueNumber,
        fromDivision: createStoreIssueDto.fromDivision,
        toDivision: createStoreIssueDto.toDivision,
        requestedBy: userId,
        status: 'PENDING',
        notes: createStoreIssueDto.notes,
        itemsJson: itemsWithDetails,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        tableName: 'store_issues',
        recordId: storeIssue.id,
        afterJson: {
          issueNumber: storeIssue.issueNumber,
          fromDivision: createStoreIssueDto.fromDivision,
          toDivision: createStoreIssueDto.toDivision,
          itemCount: createStoreIssueDto.items.length,
        },
      },
    });

    return this.formatStoreIssueResponse(storeIssue);
  }

  async approveStoreIssue(
    id: string,
    approveStoreIssueDto: ApproveStoreIssueDto,
    userId: string,
  ): Promise<StoreIssueResponseDto> {
    const storeIssue = await this.prisma.storeIssue.findUnique({
      where: { id },
    });

    if (!storeIssue) {
      throw new NotFoundException('Store issue not found');
    }

    if (storeIssue.status !== 'PENDING') {
      throw new BadRequestException(`Store issue is already ${storeIssue.status}`);
    }

    const items = storeIssue.itemsJson as any[];

    await this.prisma.$transaction(async (prisma) => {
      // Update items with issued quantities
      const updatedItems = items.map((item) => {
        const approvedItem = approveStoreIssueDto.items.find(
          (ai) => ai.stockItemId === item.stockItemId,
        );

        if (!approvedItem) {
          throw new BadRequestException(
            `Stock item ${item.stockItemId} not found in approval data`,
          );
        }

        const quantityIssued = approvedItem.quantityIssued || approvedItem.quantityRequested;

        return {
          ...item,
          quantityIssued,
        };
      });

      // Update store issue
      await prisma.storeIssue.update({
        where: { id },
        data: {
          status: 'APPROVED',
          issuedBy: userId,
          issuedAt: new Date(),
          notes: approveStoreIssueDto.notes,
          itemsJson: updatedItems,
        },
      });

      // Create stock movements
      for (const item of updatedItems) {
        // Create TRANSFER_OUT movement (from division)
        await prisma.stockMovement.create({
          data: {
            stockItemId: item.stockItemId,
            division: storeIssue.fromDivision,
            movementType: StockMovementType.TRANSFER_OUT,
            quantity: -item.quantityIssued,
            referenceId: storeIssue.id,
            referenceType: 'STORE_ISSUE',
            notes: `Transfer to ${storeIssue.toDivision}: ${storeIssue.issueNumber}`,
            createdBy: userId,
          },
        });

        // Create TRANSFER_IN movement (to division)
        await prisma.stockMovement.create({
          data: {
            stockItemId: item.stockItemId,
            division: storeIssue.toDivision,
            movementType: StockMovementType.TRANSFER_IN,
            quantity: item.quantityIssued,
            referenceId: storeIssue.id,
            referenceType: 'STORE_ISSUE',
            notes: `Transfer from ${storeIssue.fromDivision}: ${storeIssue.issueNumber}`,
            createdBy: userId,
          },
        });
      }
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'APPROVE_STORE_ISSUE',
        tableName: 'store_issues',
        recordId: id,
        afterJson: {
          issueNumber: storeIssue.issueNumber,
          status: 'APPROVED',
        },
      },
    });

    return this.getStoreIssueById(id);
  }

  async getStoreIssueById(id: string): Promise<StoreIssueResponseDto> {
    const storeIssue = await this.prisma.storeIssue.findUnique({
      where: { id },
    });

    if (!storeIssue) {
      throw new NotFoundException('Store issue not found');
    }

    return this.formatStoreIssueResponse(storeIssue);
  }

  async getAllStoreIssues(
    status?: string,
    fromDivision?: Division,
    toDivision?: Division,
  ): Promise<StoreIssueResponseDto[]> {
    const storeIssues = await this.prisma.storeIssue.findMany({
      where: {
        ...(status && { status }),
        ...(fromDivision && { fromDivision }),
        ...(toDivision && { toDivision }),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return storeIssues.map((si) => this.formatStoreIssueResponse(si));
  }

  // ==================== STOCK VALUATION ====================

  async getStockValuation(division: Division): Promise<StockValuationDto> {
    const stockItems = await this.prisma.stockItem.findMany({
      where: { division },
      include: {
        movements: true,
      },
    });

    const items = stockItems.map((item) => {
      const currentStock = item.movements.reduce((sum, movement) => {
        return sum + Number(movement.quantity);
      }, 0);

      const totalValue = currentStock * Number(item.costPrice);

      return {
        stockItemId: item.id,
        name: item.name,
        currentStock: Number(currentStock.toFixed(2)),
        unitCost: Number(item.costPrice),
        totalValue: Number(totalValue.toFixed(2)),
      };
    });

    const totalValue = items.reduce((sum, item) => sum + item.totalValue, 0);

    return {
      division,
      totalItems: items.length,
      totalValue: Number(totalValue.toFixed(2)),
      items,
      generatedAt: new Date(),
    };
  }

  // ==================== SUPPLIER PERFORMANCE ====================

  async getSupplierPerformance(): Promise<SupplierPerformanceDto[]> {
    const suppliers = await this.prisma.supplier.findMany({
      include: {
        grns: {
          orderBy: {
            deliveryDate: 'desc',
          },
        },
      },
    });

    return suppliers.map((supplier) => {
      const totalGrns = supplier.grns.length;
      const totalValue = supplier.grns
        .filter((g) => g.status === 'APPROVED')
        .reduce((sum, grn) => sum + Number(grn.totalValue), 0);

      const approvedGrns = supplier.grns.filter((g) => g.status === 'APPROVED').length;
      const pendingGrns = supplier.grns.filter((g) => g.status === 'PENDING').length;
      const rejectedGrns = supplier.grns.filter((g) => g.status === 'REJECTED').length;

      const averageDeliveryValue = approvedGrns > 0 ? totalValue / approvedGrns : 0;
      const lastDelivery = supplier.grns[0];

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        totalGrns,
        totalValue: Number(totalValue.toFixed(2)),
        averageDeliveryValue: Number(averageDeliveryValue.toFixed(2)),
        lastDeliveryDate: lastDelivery?.deliveryDate,
        pendingGrns,
        approvedGrns,
        rejectedGrns,
      };
    });
  }

  // ==================== HELPER METHODS ====================

  private formatSupplierResponse(supplier: any): SupplierResponseDto {
    return {
      id: supplier.id,
      name: supplier.name,
      category: supplier.category,
      contact: supplier.contact,
      email: supplier.email,
      address: supplier.address,
    };
  }

  private formatStoreIssueResponse(storeIssue: any): StoreIssueResponseDto {
    const items = storeIssue.itemsJson as any[];
    
    return {
      id: storeIssue.id,
      issueNumber: storeIssue.issueNumber,
      fromDivision: storeIssue.fromDivision,
      toDivision: storeIssue.toDivision,
      items: items.map((item: any) => ({
        stockItemId: item.stockItemId,
        stockItemName: item.stockItemName,
        quantityRequested: Number(item.quantityRequested),
        quantityIssued: item.quantityIssued ? Number(item.quantityIssued) : undefined,
        unit: item.unit,
      })),
      issuedBy: storeIssue.issuedBy || undefined,
      receivedBy: storeIssue.receivedBy || undefined,
      status: storeIssue.status,
      notes: storeIssue.notes || undefined,
      createdAt: storeIssue.createdAt,
    };
  }
}