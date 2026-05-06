import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 100, name: 'display_name' })
  displayName: string;

  @Column({ type: 'integer', name: 'storage_gb' })
  storageGb: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'price_egp' })
  priceEgp: number;

  @Column({ type: 'integer', name: 'price_piasters' })
  pricePiasters: number;

  @Column({ type: 'integer', name: 'duration_days', default: 30 })
  durationDays: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
