/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import {NestFactory} from '@nestjs/core';
import {AppModule} from './app/app.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule, {logger: false});
}

bootstrap();
