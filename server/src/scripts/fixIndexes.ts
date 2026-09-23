import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function fixIndexes() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const collection = mongoose.connection.collection('automations');

  // Set isSystem flags on existing docs
  console.log('Updating isSystem flags on existing documents...');
  await collection.updateMany(
    { type: { $ne: 'CUSTOM' } },
    { $set: { isSystem: true } }
  );
  await collection.updateMany(
    { type: 'CUSTOM' },
    { $set: { isSystem: false } }
  );

  const indexes = await collection.indexes();
  console.log('Current indexes on automations:');
  for (const idx of indexes) {
    console.log(`- Name: ${idx.name}, key: ${JSON.stringify(idx.key)}`);
    if (idx.name && idx.name !== '_id_') {
      console.log(`Dropping index ${idx.name}...`);
      await collection.dropIndex(idx.name);
    }
  }

  // Create partial unique index
  console.log('Creating partial unique index on { institutionId: 1, type: 1 } for isSystem: true...');
  await collection.createIndex(
    { institutionId: 1, type: 1 },
    { unique: true, partialFilterExpression: { isSystem: true } }
  );
  console.log('✓ Created index successfully!');

  const updatedIndexes = await collection.indexes();
  console.log('Final indexes:');
  for (const idx of updatedIndexes) {
    console.log(`- Name: ${idx.name}, key: ${JSON.stringify(idx.key)}, unique: ${idx.unique}, partial: ${JSON.stringify(idx.partialFilterExpression)}`);
  }

  await mongoose.disconnect();
}

fixIndexes().catch(console.error);
