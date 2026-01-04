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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AlbumsService } from './albums.service';
import { FilesService } from '../files/files.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateAlbumDto } from './dto/create-album.dto';
import { AddFilesToAlbumDto } from './dto/add-files-to-album.dto';
import { ListAlbumFilesQueryDto } from './dto/list-album-files-query.dto';
import {
  CreateAlbumResponseDto,
  GetAlbumResponseDto,
  ListAlbumsResponseDto,
  ListAlbumFilesResponseDto,
  AddFilesToAlbumResponseDto,
  AlbumOperationResponseDto,
} from './dto/album-response.dto';
import { ErrorResponseDto } from '../../common/dto';

@ApiTags('Albums')
@ApiBearerAuth('JWT-auth')
@Controller('albums')
export class AlbumsController {
  constructor(
    private readonly albumsService: AlbumsService,
    private readonly filesService: FilesService,
  ) {}

  /**
   * Create a new album.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create album',
    description: 'Creates a new album with encrypted title',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Album created successfully',
    type: CreateAlbumResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
    type: ErrorResponseDto,
  })
  async createAlbum(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: CreateAlbumDto,
  ): Promise<CreateAlbumResponseDto> {
    return this.albumsService.createAlbum(authUser.userId, dto);
  }

  /**
   * List all albums.
   */
  @Get()
  @ApiOperation({
    summary: 'List albums',
    description: 'Returns all albums for the authenticated user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of albums',
    type: ListAlbumsResponseDto,
  })
  async listAlbums(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<ListAlbumsResponseDto> {
    return this.albumsService.listAlbums(authUser.userId);
  }

  /**
   * Get album details.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get album',
    description: 'Returns album metadata including file count',
  })
  @ApiParam({
    name: 'id',
    description: 'Album UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Album details',
    type: GetAlbumResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Album not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied',
    type: ErrorResponseDto,
  })
  async getAlbum(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) albumId: string,
  ): Promise<GetAlbumResponseDto> {
    return this.albumsService.getAlbum(albumId, authUser.userId);
  }

  /**
   * Add files to an album.
   */
  @Post(':id/files')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add files to album',
    description: 'Adds one or more files to an album. Duplicates are ignored.',
  })
  @ApiParam({
    name: 'id',
    description: 'Album UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Files added to album',
    type: AddFilesToAlbumResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Album not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'One or more files not found or not accessible',
    type: ErrorResponseDto,
  })
  async addFilesToAlbum(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) albumId: string,
    @Body() dto: AddFilesToAlbumDto,
  ): Promise<AddFilesToAlbumResponseDto> {
    return this.albumsService.addFilesToAlbum(albumId, authUser.userId, dto);
  }

  /**
   * List files in an album.
   */
  @Get(':id/files')
  @ApiOperation({
    summary: 'List album files',
    description: 'Returns paginated list of files in an album',
  })
  @ApiParam({
    name: 'id',
    description: 'Album UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated list of album files',
    type: ListAlbumFilesResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Album not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied',
    type: ErrorResponseDto,
  })
  async listAlbumFiles(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) albumId: string,
    @Query() query: ListAlbumFilesQueryDto,
  ): Promise<ListAlbumFilesResponseDto> {
    return this.albumsService.listAlbumFiles(albumId, authUser.userId, {
      page: query.page,
      limit: query.limit,
    });
  }

  /**
   * Remove a file from an album.
   */
  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove file from album',
    description: 'Removes a file from the album (does not delete the file)',
  })
  @ApiParam({
    name: 'id',
    description: 'Album UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiParam({
    name: 'fileId',
    description: 'File UUID',
    example: '987fcdeb-51a2-3d4e-b678-426614174001',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'File removed from album',
    type: AlbumOperationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Album or file not found',
    type: ErrorResponseDto,
  })
  async removeFileFromAlbum(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) albumId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<AlbumOperationResponseDto> {
    return this.filesService.removeFileFromAlbum(
      fileId,
      authUser.userId,
      albumId,
    );
  }

  /**
   * Delete an album.
   * This only removes the album, not the files.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete album',
    description: 'Deletes an album. Files in the album are not deleted.',
  })
  @ApiParam({
    name: 'id',
    description: 'Album UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Album deleted',
    type: AlbumOperationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Album not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied',
    type: ErrorResponseDto,
  })
  async deleteAlbum(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) albumId: string,
  ): Promise<AlbumOperationResponseDto> {
    return this.albumsService.deleteAlbum(albumId, authUser.userId);
  }
}
