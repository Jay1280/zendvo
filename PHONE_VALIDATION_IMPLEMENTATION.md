# Phone Number Validation & Sanitization Implementation

## Overview
This implementation addresses Issue 1: Phone & OTP Input Validation (Sanitization) by implementing strict E.164 standard validation and sanitization for phone numbers in the OTP service.

## Files Modified/Created

### 1. Enhanced Validation Functions (`src/lib/validation.ts`)
**Added Functions:**
- `sanitizePhoneNumber(phone: string): string` - Sanitizes phone numbers to E.164 format
- `validateE164PhoneNumber(phone: string): boolean` - Validates E.164 compliance

**Key Features:**
- Trims whitespace and removes formatting characters (spaces, dashes, parentheses, dots)
- Automatically adds +234 prefix for Nigerian local numbers (starting with 0)
- Preserves existing international prefixes (+)
- Ensures strict E.164 format: + followed by 7-15 digits

### 2. Enhanced OTP Service (`src/server/services/otpService.ts`)
**Added Function:**
- `sendOTP(phoneNumber: string)` - Sends OTP via SMS with strict validation

**Features:**
- Validates phone number using E.164 standard before processing
- Sanitizes phone number before database operations
- Comprehensive error handling with specific error codes
- Audit logging for security and compliance
- Mock SMS provider integration (ready for Twilio/AWS SNS)

### 3. Updated User Lookup API (`src/app/api/users/lookup/route.ts`)
**Changes:**
- Replaced basic validation with E.164 validation
- Uses `sanitizePhoneNumber()` for consistent data storage
- Improved error messages with format examples

### 4. New Phone OTP API (`src/app/api/auth/send-phone-otp/route.ts`)
**New Endpoint:** `POST /api/auth/send-phone-otp`
- Rate limiting: 3 requests per hour per phone number
- CSRF protection
- E.164 validation and sanitization
- Comprehensive error handling

### 5. Comprehensive Test Suites
**`__tests__/lib/validation.test.ts`** - 70+ test cases covering:
- Nigerian phone number formats
- International phone number formats  
- Invalid format rejection
- Edge cases and integration scenarios

**`__tests__/server/services/otpService.test.ts`** - OTP service tests:
- Phone number validation in OTP context
- User lookup scenarios
- Error handling
- Database interaction mocking

## Phone Number Format Support

### Nigerian Formats (auto-converts to +234)
```
08123456789    → +2348123456789
09012345678    → +2349012345678
08098765432    → +2348098765432
081-234-56789  → +2348123456789
(090) 123-45678 → +2349012345678
```

### International Formats (preserves country code)
```
+447911234567   → +447911234567
+15551234567    → +15551234567
+1 (555) 123-4567 → +15551234567
```

### Invalid Formats (rejected)
```
123            → Too short
abc            → Contains letters
+0             → Invalid country code
+234           → Too short after country code
```

## Security Features

1. **Input Sanitization**: All phone numbers are trimmed and sanitized before processing
2. **E.164 Validation**: Strict compliance with international phone number standards
3. **Rate Limiting**: 3 OTP requests per hour per phone number
4. **CSRF Protection**: Origin validation for API endpoints
5. **Audit Logging**: All OTP requests are logged for security monitoring
6. **Error Handling**: Specific error codes for different failure scenarios

## Database Impact

All phone numbers stored in the database will now be in E.164 format:
- Consistent storage format
- No duplicate entries due to formatting differences
- Better SMS gateway compatibility
- Improved data integrity

## SMS Integration Ready

The implementation includes a mock SMS provider function that can be easily replaced with:
- Twilio integration
- AWS SNS integration  
- Any other SMS provider

## Testing

Run the comprehensive test suite:
```bash
npm test
```

Test coverage includes:
- ✅ All phone number formats
- ✅ Edge cases and error conditions
- ✅ Integration with existing services
- ✅ API endpoint validation
- ✅ Database interaction scenarios

## Migration Notes

Existing phone numbers in the database may need to be migrated to E.164 format. The sanitization function can be used for this purpose.

## Usage Examples

### Frontend Integration
```typescript
import { validateE164PhoneNumber } from "@/lib/validation";

// Validate user input
const phoneNumber = "+2348123456789";
if (validateE164PhoneNumber(phoneNumber)) {
  // Send OTP
  const response = await fetch('/api/auth/send-phone-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber })
  });
}
```

### Backend Integration
```typescript
import { sendOTP } from "@/server/services/otpService";

// Send OTP with automatic validation and sanitization
const result = await sendOTP("08123456789"); // Will be sanitized to +2348123456789
```

## Compliance

This implementation ensures:
- ✅ E.164 standard compliance
- ✅ Nigerian local number support
- ✅ International number support
- ✅ Data integrity and consistency
- ✅ SMS gateway compatibility
- ✅ Security best practices
