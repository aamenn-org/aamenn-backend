import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Contact } from '../../database/entities/contact.entity';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
  ) {}

  async syncGoogleContacts(userId: string, accessToken: string) {
    // 🚨 IMPORTANT: THIS IS NOT ZERO-KNOWLEDGE!
    // TODO: Convert to client-side encryption for true zero-knowledge
    // Current flow: Google API → Backend (plaintext) → Database (plaintext)
    // Target flow: Google API → Frontend (encrypt) → Backend (encrypted blob) → Database (encrypted)
    
    if (!accessToken) {
      throw new BadRequestException('Access token is required');
    }

    try {
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });

      const people = google.people({ 
        version: 'v1', 
        auth: oauth2Client 
      });
      
      const response = await people.people.connections.list({
        resourceName: 'people/me',
        personFields: 'names,nicknames,phoneNumbers,emailAddresses,addresses,organizations,occupations,birthdays,genders,biographies,relations,events,userDefined,photos,urls',
        pageSize: 5000,
      });

      const connections = response.data.connections || [];
      
      // 🚨 SECURITY WARNING: Backend processes plaintext contact data!
      // TODO: Move this processing to client-side with master key encryption
      await this.contactRepository.delete({ userId });
      
      // 🚨 NOT ZERO-KNOWLEDGE: Processing plaintext contacts on backend
      // TODO: Frontend should encrypt contacts before sending to backend
      const contacts = this.processGoogleConnections(connections, userId);
      
      if (contacts.length > 0) {
        // 🚨 SECURITY ISSUE: Storing plaintext contact data in database
        // TODO: Store only encrypted blobs from client-side encryption
        await this.contactRepository.save(contacts);
      }
      
      return {
        success: true,
        synced: contacts.length,
        message: `Successfully synced ${contacts.length} contacts`
      };

    } catch (error) {
      if (error.code === 403) {
        throw new BadRequestException('Google People API is not enabled. Please enable it in your Google Cloud Console.');
      }
      
      if (error.code === 401) {
        throw new BadRequestException('Access token expired or invalid. Please try signing in again.');
      }
      
      if (error.code === 429) {
        throw new BadRequestException('Google API quota exceeded. Please try again later.');
      }
      
      throw new BadRequestException('Failed to sync contacts. Please try again.');
    }
  }

  private processGoogleConnections(connections: any[], userId: string) {
    // 🚨 CRITICAL SECURITY FLAW: Processing plaintext contact data!
    // TODO: This entire method should be moved to client-side
    // Frontend should encrypt contacts with master key before sending to backend
    
    return connections.map(person => ({
      userId,
      googleContactId: person.resourceName,
      // 🚨 WARNING: These fields are NOT encrypted despite the "Encrypted" suffix!
      // TODO: Frontend should encrypt these with master key before sending
      nameEncrypted: person.names?.[0]?.displayName,           // ← PLAINTEXT!
      nicknameEncrypted: person.nicknames?.[0]?.value,           // ← PLAINTEXT!
      phoneEncrypted: person.phoneNumbers?.map((p: any) => p.value).join(', '), // ← PLAINTEXT!
      emailEncrypted: person.emailAddresses?.map((e: any) => e.value).join(', '), // ← PLAINTEXT!
      addressEncrypted: person.addresses?.[0] ? 
        `${person.addresses[0].streetAddress}, ${person.addresses[0].city}, ${person.addresses[0].country}`.trim() : undefined, // ← PLAINTEXT!
      organizationEncrypted: person.organizations?.[0]?.name,    // ← PLAINTEXT!
      occupationEncrypted: person.occupations?.[0]?.value,        // ← PLAINTEXT!
      birthdayEncrypted: person.birthdays?.[0]?.date ? 
        `${person.birthdays[0].date.year}-${person.birthdays[0].date.month}-${person.birthdays[0].date.day}` : undefined, // ← PLAINTEXT!
      bioEncrypted: person.biographies?.[0]?.value,               // ← PLAINTEXT!
      urlsEncrypted: person.urls?.map((u: any) => u.value).join(', '), // ← PLAINTEXT!
      photoUrlEncrypted: person.photos?.[0]?.url                   // ← PLAINTEXT!
    }));
  }

  async getUserContacts(userId: string) {
    return this.contactRepository.find({ 
      where: { userId },
      order: { createdAt: 'DESC' }
    });
  }

  async deleteAllContacts(userId: string) {
    await this.contactRepository.delete({ userId });
    return { success: true, message: 'All contacts deleted' };
  }

}
