import mongoose from 'mongoose';
import { resolveMongoUri } from './config/env';
import { logInfo } from './lib/logger';

export async function connectDatabase(uri = resolveMongoUri()): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const { host, name } = mongoose.connection;
  logInfo('db', `Connected to MongoDB (${host}/${name})`);
}
