import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

// Activacion de validaciones globales para los DTOs en toda la API
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Elimina campos que el Frontend envia por error
    forbidNonWhitelisted: true, // Bloquea la peticion si el Frontend envia campos que no estan en el DTO
   }), 
);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
