import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
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
    summary: 'Sync Google Contacts',
    description: 'Fetch and store user contacts from Google People API using OAuth access token'
  })
  @ApiResponse({ status: 200, description: 'Contacts synced successfully' })
  @ApiResponse({ status: 400, description: 'Invalid access token or sync failed' })
  async syncContacts(
    @Body() dto: SyncContactsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      const result = await this.contactsService.syncGoogleContacts(user.userId, dto.accessToken);
      return result;
    } catch (error) {
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get user contacts' })
  @ApiResponse({ status: 200, description: 'Returns list of user contacts' })
  async getContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.getUserContacts(user.userId);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all contacts' })
  @ApiResponse({ status: 200, description: 'All contacts deleted successfully' })
  async deleteContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.deleteAllContacts(user.userId);
  }
}
