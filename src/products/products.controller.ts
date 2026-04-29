import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  CreateStockItemDto,
  UpdateStockItemDto,
  StockItemResponseDto,
  CreateStockMovementDto,
  StockMovementResponseDto,
  StockCountDto,
  StockCountResultDto,
  StockLevelDto,
  CreateRecipeDto,
  RecipeResponseDto,
} from './dto/products.dto';
import { Division } from '@prisma/client';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ==================== PRODUCTS ====================

  @Post()
  @Roles('MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createProduct(
    @Request() req,
    @Body() createProductDto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.createProduct(createProductDto, req.user.userId);
  }

  @Get()
  async getAllProducts(
    @Query('division') division?: Division,
  ): Promise<ProductResponseDto[]> {
    return this.productsService.getAllProducts(division);
  }

  @Get(':id')
  async getProductById(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.getProductById(id);
  }

  @Put(':id')
  @Roles('MANAGER', 'OWNER')
  async updateProduct(
    @Request() req,
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.updateProduct(id, updateProductDto, req.user.userId);
  }

  @Delete(':id')
  @Roles('MANAGER', 'OWNER')
  async deleteProduct(@Request() req, @Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.deleteProduct(id, req.user.userId);
  }

  // ==================== STOCK ITEMS ====================

  @Post('stock-items')
  @Roles('MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createStockItem(
    @Request() req,
    @Body() createStockItemDto: CreateStockItemDto,
  ): Promise<StockItemResponseDto> {
    return this.productsService.createStockItem(createStockItemDto, req.user.userId);
  }

  @Get('stock-items/all')
  async getAllStockItems(
    @Query('division') division?: Division,
  ): Promise<StockItemResponseDto[]> {
    return this.productsService.getAllStockItems(division);
  }

  @Get('stock-items/:id')
  async getStockItemById(@Param('id') id: string): Promise<StockItemResponseDto> {
    return this.productsService.getStockItemById(id);
  }

  @Put('stock-items/:id')
  @Roles('MANAGER', 'OWNER')
  async updateStockItem(
    @Request() req,
    @Param('id') id: string,
    @Body() updateStockItemDto: UpdateStockItemDto,
  ): Promise<StockItemResponseDto> {
    return this.productsService.updateStockItem(id, updateStockItemDto, req.user.userId);
  }

  // ==================== STOCK MOVEMENTS ====================

  @Post('stock-movements')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async recordStockMovement(
    @Request() req,
    @Body() stockMovementDto: CreateStockMovementDto,
  ): Promise<StockMovementResponseDto> {
    return this.productsService.recordStockMovement(stockMovementDto, req.user.userId);
  }

  @Get('stock-movements/all')
  async getStockMovements(
    @Query('stockItemId') stockItemId?: string,
    @Query('division') division?: Division,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<StockMovementResponseDto[]> {
    return this.productsService.getStockMovements(
      stockItemId,
      division,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  // ==================== STOCK COUNT ====================

  @Post('stock-count')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @HttpCode(HttpStatus.OK)
  async performStockCount(
    @Request() req,
    @Body() stockCountDto: StockCountDto,
  ): Promise<StockCountResultDto> {
    return this.productsService.performStockCount(stockCountDto, req.user.userId);
  }

  // ==================== STOCK LEVELS ====================

  @Get('stock-levels/current')
  async getCurrentStockLevels(@Query('division') division?: Division): Promise<StockLevelDto[]> {
    return this.productsService.getCurrentStockLevels(division);
  }

  // ==================== RECIPES ====================

  @Post('recipes')
  @Roles('MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createRecipe(
    @Request() req,
    @Body() createRecipeDto: CreateRecipeDto,
  ): Promise<RecipeResponseDto> {
    return this.productsService.createRecipe(createRecipeDto, req.user.userId);
  }

  @Get('recipes/product/:productId')
  async getRecipesByProduct(@Param('productId') productId: string): Promise<RecipeResponseDto[]> {
    return this.productsService.getRecipesByProduct(productId);
  }

  @Delete('recipes/:id')
  @Roles('MANAGER', 'OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecipe(@Request() req, @Param('id') id: string): Promise<void> {
    return this.productsService.deleteRecipe(id, req.user.userId);
  }
}
