import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FoldersService } from './folders.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { ErrorResponseDto } from '../../common/dto';

@ApiTags('Folders')
@ApiBearerAuth('JWT-auth')
@Controller('folders')
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  /**
   * Create a new folder.
   * Folder name is encrypted client-side — backend NEVER sees plaintext.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create folder',
    description: `Creates a new folder with encrypted name. Zero-knowledge: backend never sees plaintext folder name.`,
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Folder created' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  async createFolder(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: CreateFolderDto,
  ) {
    return this.foldersService.createFolder(authUser.userId, dto);
  }

  /**
   * Unified library listing — returns breadcrumbs, child folders, and child files.
   */
  @Get('library')
  @ApiOperation({
    summary: 'Get library view',
    description: `Returns the unified library view: current folder metadata, breadcrumb trail, child folders, and paginated child files. Pass no folderId for root.`,
  })
  @ApiQuery({ name: 'folderId', required: false, description: 'Folder ID (omit for root)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: HttpStatus.OK, description: 'Library view' })
  async getLibrary(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query('folderId') folderId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.foldersService.getLibrary(
      authUser.userId,
      folderId || null,
      {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
      },
    );
  }

  /**
   * List folders at a given level.
   */
  @Get()
  @ApiOperation({
    summary: 'List folders',
    description: 'List folders at root or under a parent folder.',
  })
  @ApiQuery({ name: 'parentFolderId', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of folders' })
  async listFolders(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query('parentFolderId') parentFolderId?: string,
  ) {
    return this.foldersService.listFolders(
      authUser.userId,
      parentFolderId || null,
    );
  }

  /**
   * Get all files in a folder recursively (for sharing).
   * Zero-knowledge: returns cipherFileKey so client generates share keys.
   */
  @Get(':id/all-files')
  @ApiOperation({
    summary: 'Get all files in folder recursively',
    description: 'Returns all files in folder and subfolders. Used for sharing. cipherFileKey is encrypted — client decrypts.',
  })
  @ApiParam({ name: 'id', description: 'Folder UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'All files in folder tree' })
  async getAllFilesInFolder(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.getAllFilesInFolder(folderId, authUser.userId);
  }

  /**
   * Get folder details.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get folder', description: 'Get folder metadata' })
  @ApiParam({ name: 'id', description: 'Folder UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Folder details' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async getFolder(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.getFolder(folderId, authUser.userId);
  }

  /**
   * Update folder (rename or move).
   * Name is encrypted client-side — backend NEVER sees plaintext.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update folder',
    description: 'Rename (encrypted name) or move folder to another parent.',
  })
  @ApiParam({ name: 'id', description: 'Folder UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Folder updated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async updateFolder(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.foldersService.updateFolder(folderId, authUser.userId, dto);
  }

  /**
   * Delete folder — recursive subtree trash.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete folder (trash subtree)',
    description: 'Moves folder and all nested files/subfolders to trash.',
  })
  @ApiParam({ name: 'id', description: 'Folder UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Folder trashed' })
  async deleteFolder(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.deleteFolder(folderId, authUser.userId);
  }

  /**
   * Restore folder — recursive subtree restore.
   */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore folder from trash',
    description: 'Restores folder and all nested files/subfolders from trash.',
  })
  @ApiParam({ name: 'id', description: 'Folder UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Folder restored' })
  async restoreFolder(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.restoreFolder(folderId, authUser.userId);
  }

  /**
   * Permanently delete folder and all contents.
   */
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Permanently delete folder',
    description: 'Permanently deletes folder and all nested files/subfolders. Cannot be undone.',
  })
  @ApiParam({ name: 'id', description: 'Folder UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Folder permanently deleted' })
  async deleteFolderPermanently(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.deleteFolderPermanently(
      folderId,
      authUser.userId,
    );
  }

  /**
   * Move files to a folder (or root).
   */
  @Post('move-files')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move files to folder',
    description: 'Move one or more files to a target folder (or root if targetFolderId is null).',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Files moved' })
  async moveFilesToFolder(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body('fileIds') fileIds: string[],
    @Body('targetFolderId') targetFolderId: string | null,
  ) {
    return this.foldersService.moveFilesToFolder(
      fileIds,
      targetFolderId,
      authUser.userId,
    );
  }

  /**
   * Move a folder to another parent (or root).
   */
  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move folder',
    description: 'Move a folder to another parent folder (or root if targetParentFolderId is null).',
  })
  @ApiParam({ name: 'id', description: 'Folder UUID to move' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Folder moved' })
  async moveFolderToFolder(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Body('targetParentFolderId') targetParentFolderId: string | null,
  ) {
    return this.foldersService.moveFolderToFolder(
      folderId,
      targetParentFolderId,
      authUser.userId,
    );
  }
}
