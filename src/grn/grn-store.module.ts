import { Module } from '@nestjs/common';
import { GrnStoreService } from './grn-store.service';
import { GrnStoreController } from './grn-store.controller';

@Module({
  controllers: [GrnStoreController],
  providers: [GrnStoreService],
  exports: [GrnStoreService],
})
export class GrnStoreModule {}
