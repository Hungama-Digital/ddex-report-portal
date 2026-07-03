import { resetUserPasswordInDb } from '../server/services/localStore.js';

async function main() {
  await resetUserPasswordInDb(8, 'Ranjeet123');
  console.log('Password reset successfully for Ranjeet Kumar');
}

main().catch(console.error);
