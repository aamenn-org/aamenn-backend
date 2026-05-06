import { IsArray, ValidateNested, IsString, IsOptional, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class EncryptedContactDto {
  @ApiProperty({ description: 'Google contact resource name (plaintext ID, not sensitive)', example: 'people/c1234567890' })
  @IsString()
  @IsOptional()
  googleContactId?: string;

  @ApiProperty({ description: 'AES-GCM encrypted name (base64)', required: false })
  @IsString()
  @IsOptional()
  nameEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nicknameEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phoneEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  emailEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  addressEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  organizationEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  occupationEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  birthdayEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  bioEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  urlsEncrypted?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  photoUrlEncrypted?: string;

  @ApiProperty({
    description: 'HMAC-SHA256 trigram tokens for ZK search (64-bit hex, max 500)',
    type: [String],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(500)
  @IsOptional()
  searchTokens?: string[];
}

export class SyncContactsDto {
  @ApiProperty({
    description: 'Array of contacts pre-encrypted by the client with the user master key',
    type: [EncryptedContactDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EncryptedContactDto)
  contacts: EncryptedContactDto[];
}
