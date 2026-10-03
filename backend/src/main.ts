import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Permite que el frontend Angular (localhost:4200) llame al backend
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:4200' });

  // Activación de validaciones globales para los DTOs en toda la API
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina campos que el Frontend envía por error
      forbidNonWhitelisted: true, // Bloquea la petición si el Frontend envía campos que no están en el DTO
      transform: true, // Convierte el body al tipo del DTO (necesario para limpiar el nombre en CreateItemDto)
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
