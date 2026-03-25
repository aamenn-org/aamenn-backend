import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { SharesService } from './shares.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateSharesDto } from './dto/create-share.dto';
import { ListSharesQueryDto } from './dto/list-shares-query.dto';
import {
  CreateSharesResponseDto,
  ListSharesResponseDto,
  RevokeShareResponseDto,
  ResolveShareFileResponseDto,
} from './dto/share-response.dto';
import { ErrorResponseDto } from '../../common/dto';

@ApiTags('Shares')
@Controller('shares')
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Post()
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create share links',
    description: 'Create public share links for files or folders. Supports bulk creation.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Share links created successfully',
    type: CreateSharesResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input or resource not found',
    type: ErrorResponseDto,
  })
  async createShares(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: CreateSharesDto,
    @Headers('origin') origin?: string,
  ): Promise<CreateSharesResponseDto> {
    const frontendBaseUrl = origin || 'http://localhost:5173';
    const shares = await this.sharesService.createShares(
      authUser.userId,
      dto.items,
      frontendBaseUrl,
    );
    return { shares };
  }

  @Get()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List share links',
    description: 'List all share links created by the authenticated user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of share links',
    type: ListSharesResponseDto,
  })
  async listShares(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query() query: ListSharesQueryDto,
    @Headers('origin') origin?: string,
  ): Promise<ListSharesResponseDto> {
    const frontendBaseUrl = origin || 'http://localhost:5173';
    return this.sharesService.listShares(
      authUser.userId,
      query.page || 1,
      query.limit || 50,
      frontendBaseUrl,
    );
  }

  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke share link',
    description: 'Revoke a share link. The link will no longer be accessible.',
  })
  @ApiParam({
    name: 'id',
    description: 'Share link UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Share link revoked',
    type: RevokeShareResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Share link not found',
    type: ErrorResponseDto,
  })
  async revokeShare(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) shareId: string,
  ): Promise<RevokeShareResponseDto> {
    return this.sharesService.revokeShare(shareId, authUser.userId);
  }

  @Get(':slug')
  @Public()
  @ApiOperation({
    summary: 'Resolve share link (public)',
    description: `Resolve a public share link by slug. Returns file or folder data with encrypted metadata.
    
**Public Access:**
- No authentication required
- Share key is provided in URL fragment by client
- Returns encrypted data that can be decrypted client-side with the share key`,
  })
  @ApiParam({
    name: 'slug',
    description: 'Share link slug',
    example: 'my-vacation-photo',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Share resolved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Share link not found, expired, or revoked',
    type: ErrorResponseDto,
  })
  async resolveShare(
    @Param('slug') slug: string,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const share = await this.sharesService.resolveShare(slug);

    if (share.resourceType === 'file') {
      const fileData = await this.sharesService.resolveFileShare(
        share.resourceId,
      );
      return {
        type: 'file',
        shareKey: share.shareKey,
        data: fileData,
      };
    } else if (share.resourceType === 'folder') {
      const folderData = await this.sharesService.resolveFolderShare(
        share.resourceId,
      );
      return {
        type: 'folder',
        shareKey: share.shareKey,
        fileKeys: share.metadata?.fileKeys || {},
        data: folderData,
      };
    }
  }
}
