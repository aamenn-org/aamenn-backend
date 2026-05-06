import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { UploadsService } from './uploads.service';
import { StartUploadDto } from './dto/start-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a chunked upload session' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Upload session created' })
  async startUpload(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: StartUploadDto,
  ) {
    return this.uploadsService.startUpload(authUser.userId, dto);
  }

  @Post(':uploadId/part-urls')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get signed URLs for uploading parts directly to B2' })
  async getPartUrls(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Body('count') count: number,
  ) {
    return this.uploadsService.getPartUrls(authUser.userId, uploadId, count ?? 1);
  }

  @Post(':uploadId/part-complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that a part was successfully uploaded to B2' })
  async recordPart(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Body('partNumber') partNumber: number,
    @Body('sha1') sha1: string,
  ) {
    return this.uploadsService.recordPart(authUser.userId, uploadId, partNumber, sha1);
  }

  @Post(':uploadId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish a chunked upload and create the file record' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Upload completed, file created' })
  async completeUpload(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.uploadsService.completeUpload(authUser.userId, uploadId, dto);
  }

  @Post(':uploadId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an in-progress upload and clean up B2 data' })
  async cancelUpload(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
  ) {
    return this.uploadsService.cancelUpload(authUser.userId, uploadId);
  }

  @Get(':uploadId/status')
  @ApiOperation({ summary: 'Get upload session status with B2-reconciled part list' })
  async getStatus(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
  ) {
    return this.uploadsService.getSessionStatus(authUser.userId, uploadId);
  }

  @Get('pending')
  @ApiOperation({ summary: 'List all active (unfinished) upload sessions' })
  async listPending(@CurrentUser() authUser: AuthenticatedUser) {
    return this.uploadsService.listPendingSessions(authUser.userId);
  }
}
