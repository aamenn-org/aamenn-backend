import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class UpdateFolderDto {
  @ApiPropertyOptional({
    description: 'New encrypted folder name (base64). Encrypted client-side with master key.',
  })
  @IsOptional()
  @IsString()
  nameEncrypted?: string;

  @ApiPropertyOptional({
    description: 'New parent folder ID. Set to null to move to root.',
  })
  @IsOptional()
  @IsUUID()
  parentFolderId?: string | null;
}
