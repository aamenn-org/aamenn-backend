import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * DTO for creating an album
 */
export class CreateAlbumDto {
  @ApiProperty({
    description:
      'The album title, encrypted by the client. Backend cannot decrypt this.',
    example: 'U2FsdGVkX1+abc123...encrypted_title...',
    maxLength: 10000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  titleEncrypted: string;
}
