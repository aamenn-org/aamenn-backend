import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto, FeedbackQueryDto } from './dto';
import { AdminGuard } from '../../common/guards';

@ApiTags('Feedback')
@ApiBearerAuth()
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * Submit feedback (authenticated users)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit feedback',
    description: 'Allows authenticated users to submit feedback with a category and message.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Feedback submitted' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  async create(@Req() req: any, @Body() dto: CreateFeedbackDto) {
    const feedback = await this.feedbackService.create(req.user.userId, dto);
    return { id: feedback.id, category: feedback.category, createdAt: feedback.createdAt };
  }

  /**
   * Get all feedbacks (admin only)
   */
  @Get()
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all feedbacks (admin)',
    description: 'Returns paginated list of all user feedbacks. Optionally filter by category.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of feedbacks' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin access required' })
  async findAll(@Query() query: FeedbackQueryDto) {
    return this.feedbackService.findAll(query);
  }

  /**
   * Get feedback stats grouped by category (admin only)
   */
  @Get('stats')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get feedback statistics (admin)',
    description: 'Returns feedback count grouped by category.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Feedback statistics' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin access required' })
  async getStats() {
    return this.feedbackService.getStats();
  }
}
