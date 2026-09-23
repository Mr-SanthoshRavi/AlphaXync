import { captchaService } from '../modules/auth/captchaService';

async function runTest() {
  console.log('🧪 Starting CAPTCHA Flow Verification...');

  // 1. Generate challenge
  const challenge = captchaService.generateChallenge();
  console.log(`✅ Challenge Generated:`);
  console.log(`   - Challenge ID: ${challenge.challengeId}`);
  console.log(`   - Target: ${challenge.targetLabel} (${challenge.targetCategory})`);
  console.log(`   - Prompt: "${challenge.prompt}"`);
  console.log(`   - Total Tiles: ${challenge.tiles.length}`);
  console.log(`   - Token Length: ${challenge.challengeToken.length}`);

  if (challenge.tiles.length !== 9) {
    throw new Error(`Expected 9 tiles, got ${challenge.tiles.length}`);
  }

  // 2. Identify correct indices from tiles
  const correctIndices = challenge.tiles
    .filter((t) => t.category === challenge.targetCategory)
    .map((t) => t.id);
  console.log(`   - Correct Indices: [${correctIndices.join(', ')}]`);

  // 3. Test wrong selection
  const wrongIndices = [999];
  const failRes = captchaService.verifyChallenge(challenge.challengeToken, wrongIndices);
  if (failRes.success) {
    throw new Error('Expected wrong selection to fail verification!');
  }
  console.log(`✅ Negative Test Passed: Incorrect indices properly rejected (${failRes.error})`);

  // 4. Test correct selection
  const successRes = captchaService.verifyChallenge(challenge.challengeToken, correctIndices);
  if (!successRes.success || !successRes.captchaToken) {
    throw new Error(`Expected correct selection to pass! Error: ${successRes.error}`);
  }
  console.log(`✅ Positive Test Passed: Verification successful!`);
  console.log(`   - Issued Verification Token: ${successRes.captchaToken.slice(0, 30)}...`);

  // 5. Test token verification
  const isValid = await captchaService.verifyCaptchaVerificationToken(successRes.captchaToken);
  if (!isValid) {
    throw new Error('Expected verifyCaptchaVerificationToken to return true for issued token!');
  }
  console.log(`✅ Token Validation Passed: Valid token recognized.`);

  // 6. Test tampered token
  const isTamperedValid = await captchaService.verifyCaptchaVerificationToken(successRes.captchaToken + 'tamper');
  if (isTamperedValid) {
    throw new Error('Expected tampered token to be rejected!');
  }
  console.log(`✅ Anti-Tampering Test Passed: Modified token rejected.`);

  console.log('\n🎉 ALL CAPTCHA VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
