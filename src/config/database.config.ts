import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { MongooseModuleFactoryOptions } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

const logger = new Logger('Database');

/**
 * Builds Mongoose connection options from environment configuration.
 */
export function getDatabaseConfig(
  configService: ConfigService,
): MongooseModuleFactoryOptions {
  const uri = configService.get<string>('MONGODB_URI');
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is required');
  }

  const dbName = configService.get<string>('MONGODB_DB_NAME') || 'Tuition_SaaS';

  return {
    uri,
    dbName,
    onConnectionCreate: (connection: Connection) => {
      connection.on('connected', () => {
        logger.log(`Connected to MongoDB database "${connection.name}"`);
      });
      connection.on('error', (err: Error) => {
        logger.error(`MongoDB connection error: ${err.message}`);
      });
      connection.on('disconnected', () => {
        logger.warn('Disconnected from MongoDB');
      });
    },
  };
}
