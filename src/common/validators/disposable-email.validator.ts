import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// The package exports an array of disposable email domains
// eslint-disable-next-line @typescript-eslint/no-var-requires
const disposableDomains: string[] = require('disposable-email-domains');

const disposableSet = new Set(disposableDomains.map((d: string) => d.toLowerCase()));

@ValidatorConstraint({ async: false })
export class IsNotDisposableEmailConstraint implements ValidatorConstraintInterface {
  validate(email: string): boolean {
    if (!email || typeof email !== 'string') return true; // Let @IsEmail handle format
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return true; // Let @IsEmail handle format
    return !disposableSet.has(domain);
  }

  defaultMessage(): string {
    return 'Disposable email addresses are not allowed. Please use a permanent email.';
  }
}

/**
 * Custom decorator that rejects disposable/temporary email addresses.
 * Uses the `disposable-email-domains` package (~35k known throwaway domains).
 */
export function IsNotDisposableEmail(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotDisposableEmailConstraint,
    });
  };
}
