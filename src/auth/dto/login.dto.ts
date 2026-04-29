import { IsString, Length, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits' })
  pin: string;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}

export class LoginResponseDto {
  accessToken: string;
  user: {
    id: string;
    name: string;
    role: string;
    division: string | null;
  };
}
