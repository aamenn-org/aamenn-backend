import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from '../../database/entities/feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackQueryDto } from './dto/feedback-query.dto';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectRepository(Feedback)
    private feedbackRepository: Repository<Feedback>,
  ) {}

  /**
   * Create a new feedback entry from an authenticated user
   */
  async create(userId: string, dto: CreateFeedbackDto): Promise<Feedback> {
    const feedback = this.feedbackRepository.create({
      userId,
      category: dto.category,
      message: dto.message,
    });

    const saved = await this.feedbackRepository.save(feedback);
    this.logger.log(`Feedback created by user ${userId}: [${dto.category}]`);
    return saved;
  }

  /**
   * Get paginated list of all feedbacks (admin)
   */
  async findAll(query: FeedbackQueryDto): Promise<{
    feedbacks: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, category } = query;
    const skip = (page - 1) * limit;

    const qb = this.feedbackRepository
      .createQueryBuilder('feedback')
      .leftJoin('feedback.user', 'user')
      .addSelect(['user.email', 'user.displayName'])
      .orderBy('feedback.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (category) {
      qb.where('feedback.category = :category', { category });
    }

    const [feedbacks, total] = await qb.getManyAndCount();

    const result = feedbacks.map((f) => ({
      ...f,
      userEmail: f.user?.email || null,
      userDisplayName: f.user?.displayName || null,
    }));

    return {
      feedbacks: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get feedback stats grouped by category (admin)
   */
  async getStats(): Promise<{ category: string; count: number }[]> {
    const stats = await this.feedbackRepository
      .createQueryBuilder('feedback')
      .select('feedback.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('feedback.category')
      .orderBy('count', 'DESC')
      .getRawMany();

    return stats.map((s) => ({
      category: s.category,
      count: parseInt(s.count, 10),
    }));
  }
}
