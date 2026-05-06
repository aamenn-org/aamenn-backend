import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from '../../database/entities/contact.entity';
import { EncryptedContactDto } from './dto/sync-contacts.dto';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
  ) {}

  async syncEncryptedContacts(userId: string, encryptedContacts: EncryptedContactDto[]) {
    if (!Array.isArray(encryptedContacts)) {
      throw new BadRequestException('contacts must be an array');
    }

    await this.contactRepository.delete({ userId });

    if (encryptedContacts.length > 0) {
      const entities = encryptedContacts.map(c => ({
        userId,
        googleContactId: c.googleContactId,
        nameEncrypted: c.nameEncrypted,
        nicknameEncrypted: c.nicknameEncrypted,
        phoneEncrypted: c.phoneEncrypted,
        emailEncrypted: c.emailEncrypted,
        addressEncrypted: c.addressEncrypted,
        organizationEncrypted: c.organizationEncrypted,
        occupationEncrypted: c.occupationEncrypted,
        birthdayEncrypted: c.birthdayEncrypted,
        bioEncrypted: c.bioEncrypted,
        urlsEncrypted: c.urlsEncrypted,
        photoUrlEncrypted: c.photoUrlEncrypted,
        searchTokens: c.searchTokens ?? [],
      }));

      const batchSize = 500;
      for (let i = 0; i < entities.length; i += batchSize) {
        await this.contactRepository.save(entities.slice(i, i + batchSize));
      }
    }

    return {
      success: true,
      synced: encryptedContacts.length,
      message: `Successfully synced ${encryptedContacts.length} contacts`,
    };
  }

  async getUserContacts(userId: string, page: number, limit: number) {
    const [data, total] = await this.contactRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async searchContacts(userId: string, tokens: string[], page: number, limit: number) {
    const qb = this.contactRepository
      .createQueryBuilder('c')
      .where('c.user_id = :userId', { userId })
      .orderBy('c.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    tokens.forEach((token, i) => {
      qb.andWhere(`:token${i} = ANY(c.search_tokens)`, { [`token${i}`]: token });
    });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async deleteAllContacts(userId: string) {
    await this.contactRepository.delete({ userId });
    return { success: true, message: 'All contacts deleted' };
  }
}
