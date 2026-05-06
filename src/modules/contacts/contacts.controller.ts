import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { SyncContactsDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Contacts')
@Controller('contacts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Post('sync')
  @ApiOperation({ 
    summary: 'Sync encrypted contacts',
    description: 'Store pre-encrypted contact blobs. The client fetches from Google and encrypts with the master key before sending — the server never sees plaintext.'
  })
  @ApiResponse({ status: 200, description: 'Contacts synced successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  async syncContacts(
    @Body() dto: SyncContactsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contactsService.syncEncryptedContacts(user.userId, dto.contacts);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search contacts by HMAC tokens (zero-knowledge)',
    description: 'Client computes HMAC-SHA256 trigram tokens from the query and sends them here. Server matches against stored tokens without ever learning the query or contact data.',
  })
  @ApiQuery({ name: 'tokens', required: true, type: String, description: 'Comma-separated HMAC tokens (max 8)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated search results (encrypted blobs)' })
  async searchContacts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tokens') tokensParam: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const tokens = tokensParam ? tokensParam.split(',').filter(Boolean) : [];
    return this.contactsService.searchContacts(
      user.userId,
      tokens,
      Number(page),
      Number(limit),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get user contacts (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Returns paginated list of user contacts' })
  async getContacts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.contactsService.getUserContacts(
      user.userId,
      Number(page),
      Number(limit),
    );
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all contacts' })
  @ApiResponse({ status: 200, description: 'All contacts deleted successfully' })
  async deleteContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.deleteAllContacts(user.userId);
  }
}
