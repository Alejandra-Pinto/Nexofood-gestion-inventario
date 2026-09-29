import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule, // Nos permite usar el UsersService
    JwtModule.register({
      global: true,
      secret: 'super-_secret_key_nexofood', // Sprint2: Deberia estar en el archivo .env
      signOptions: { expiresIn: '8h' }, //Token expira segun el truno de trabajo
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService]
})
export class AuthModule {}
