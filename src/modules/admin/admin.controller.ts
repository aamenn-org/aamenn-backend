import {
  Controller,
  Get,
  Patch,
  Delete,
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
import {
  AdminUsersQueryDto,
  UpdateUserStatusDto,
  SetUserStorageLimitDto,
  UpdatePlanDto,
} from './dto';

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
      'Returns paginated list of users with their storage and file statistics. Use sortBy=storage&sortOrder=DESC&limit=10 to get top storage users.',
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
   * Set per-user storage limit
   */
  @Patch('users/:userId/storage-limit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set user storage limit',
    description:
      'Set the storage quota for a specific user (1–1024 GB). Defaults to 5 GB.',
  })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Storage limit updated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Cannot modify admin users',
  })
  async setUserStorageLimit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetUserStorageLimitDto,
  ) {
    try {
      const user = await this.adminService.setUserStorageLimit(
        userId,
        dto.storageLimitGb,
      );
      return { id: user.id, storageLimitGb: user.storageLimitGb };
    } catch (error) {
      if (error.message === 'User not found') {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

  /**
   * Permanently delete a user and all their data (files, albums, B2 storage)
   */
  @Delete('users/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete user and all their data',
    description:
      'Permanently deletes a user account, all their files from B2 storage, albums, and all associated database records. Only regular users can be deleted.',
  })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User deleted' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Cannot delete admin users',
  })
  async deleteUser(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      return await this.adminService.deleteUser(userId);
    } catch (error) {
      if (error.message === 'User not found') {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
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

  // ─── Plan Management ─────────────────────────────────────────────

  @Get('plans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all plans',
    description:
      'Returns all storage plans (including inactive ones) for admin management.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of plans' })
  async getPlans() {
    return this.adminService.getAllPlans();
  }

  @Patch('plans/:planId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a plan',
    description:
      'Update plan details: display name, price, storage, duration, or active status.',
  })
  @ApiParam({ name: 'planId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Plan updated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Plan not found' })
  async updatePlan(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdatePlanDto,
  ) {
    try {
      return await this.adminService.updatePlan(planId, dto);
    } catch (error) {
      if (error.message === 'Plan not found') {
        throw new NotFoundException('Plan not found');
      }
      throw error;
    }
  }
}
