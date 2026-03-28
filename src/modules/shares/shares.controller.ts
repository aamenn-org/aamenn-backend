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
import { CreateShareDto } from './dto/create-share.dto';
import { ListSharesQueryDto } from './dto/list-shares-query.dto';
import {
  CreateShareResponseDto,
  ListSharesResponseDto,
  RevokeShareResponseDto,
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
    summary: 'Create share link',
    description: 'Create a single public share link for any selection of files and/or folders.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Share link created',
    type: CreateShareResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input or resource not found',
    type: ErrorResponseDto,
  })
  async createShare(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: CreateShareDto,
    @Headers('origin') origin?: string,
  ): Promise<CreateShareResponseDto> {
    const frontendBaseUrl = origin || 'http://localhost:5173';
    const share = await this.sharesService.createShare(
      authUser.userId,
      dto,
      frontendBaseUrl,
    );
    return { share };
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
  @ApiParam({ name: 'id', description: 'Share link UUID' })
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
    description: 'Resolve a public share link. Returns root items + all file keys for client-side decryption.',
  })
  @ApiParam({ name: 'slug', description: 'Share link slug', example: 'my-vacation' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Share resolved' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Share not found, expired, or revoked',
    type: ErrorResponseDto,
  })
  async resolveShare(@Param('slug') slug: string) {
    return this.sharesService.resolveShare(slug);
  }

  @Get(':slug/browse/:folderId')
  @Public()
  @ApiOperation({
    summary: 'Browse folder within a share (public)',
    description: 'Navigate into a folder that is part of a share. Returns child folders and files.',
  })
  @ApiParam({ name: 'slug', description: 'Share link slug' })
  @ApiParam({ name: 'folderId', description: 'Folder UUID to browse into' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Folder contents' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Folder is not accessible via this share',
    type: ErrorResponseDto,
  })
  async browseShareFolder(
    @Param('slug') slug: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
  ) {
    return this.sharesService.browseShareFolder(slug, folderId);
  }
}
