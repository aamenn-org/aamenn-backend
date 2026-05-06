import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateFolderDto {
  @ApiProperty({
    description: 'Encrypted folder name (base64). Encrypted client-side with master key. Backend NEVER sees plaintext.',
    example: 'base64encryptedname...',
  })
  @IsString()
  nameEncrypted: string;

  @ApiPropertyOptional({
    description: 'Parent folder ID. NULL or omitted for root level.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  parentFolderId?: string;
}
