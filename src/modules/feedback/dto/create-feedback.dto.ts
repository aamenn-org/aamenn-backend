import { IsEnum, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FeedbackCategory } from '../../../database/entities/feedback.entity';

export class CreateFeedbackDto {
  @ApiProperty({
    enum: FeedbackCategory,
    description: 'Feedback category',
    example: FeedbackCategory.UPLOAD_ISSUE,
  })
  @IsEnum(FeedbackCategory)
  category: FeedbackCategory;

  @ApiProperty({
    description: 'Feedback message text',
    example: 'The upload keeps failing when I try to upload large files.',
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}
