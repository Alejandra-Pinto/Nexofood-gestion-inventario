import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Permite que el frontend Angular (localhost:4200) llame al backend
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:4200' });

  // Valida automáticamente los DTO (campos obligatorios, tipos, rangos)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ignora campos que no estén en el DTO
      forbidNonWhitelisted: true, // ...y responde 400 si los envían
      transform: true, // convierte el body al tipo del DTO
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
