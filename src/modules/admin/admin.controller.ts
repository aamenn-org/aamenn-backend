import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminGuard } from '../../common/guards';
import { AdminUsersQueryDto, UpdateUserStatusDto } from './dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Get dashboard overview statistics
   */
  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get admin dashboard overview',
    description:
      'Returns key metrics: users, files, storage usage, and activity stats.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Dashboard statistics' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  /**
   * Get paginated list of users
   */
  @Get('users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all users with statistics',
    description:
      'Returns paginated list of users with their storage and file statistics.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of users' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async getUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.getUsers(query);
  }

  /**
   * Get top users by storage
   */
  @Get('users/top-storage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get top users by storage usage',
    description: 'Returns users sorted by storage consumption (heavy users).',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of top users' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async getTopUsersByStorage(@Query('limit') limit?: number) {
    return this.adminService.getTopUsersByStorage(limit || 10);
  }

  /**
   * Update user status (enable/disable)
   */
  @Patch('users/:userId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update user status',
    description:
      'Enable or disable a user account. Admin cannot modify other admin accounts.',
  })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User status updated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async updateUserStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    try {
      return await this.adminService.updateUserStatus(userId, dto);
    } catch (error) {
      if (error.message === 'User not found') {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  @Get('storage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get storage statistics',
    description:
      'Returns detailed storage metrics: usage, growth rate, files by type.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Storage statistics' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async getStorageStats() {
    return this.adminService.getStorageStats();
  }

  /**
   * Get system health status
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get system health status',
    description:
      'Returns system health metrics: storage warnings, database status.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'System health status' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  /**
   * Get system alerts
   */
  @Get('alerts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get system alerts',
    description:
      'Returns active alerts for storage warnings, bandwidth spikes, etc.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of alerts' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async getAlerts() {
    return this.adminService.getAlerts();
  }
}
