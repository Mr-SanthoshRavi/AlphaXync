import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { captchaService } from './captchaService';
import { AppError } from '../../middleware/errorHandler';

const verifyCaptchaSchema = z.object({
  challengeToken: z.string().min(10, 'Challenge token is required'),
  selectedIndices: z.array(z.number().int().min(0).max(8))
});

export async function getCaptchaChallenge(req: Request, res: Response, next: NextFunction) {
  try {
    const challenge = captchaService.generateChallenge();
    return res.status(200).json({
      success: true,
      data: challenge
    });
  } catch (error: any) {
    next(error);
  }
}

export async function verifyCaptchaChallenge(req: Request, res: Response, next: NextFunction) {
  try {
    const { challengeToken, selectedIndices } = verifyCaptchaSchema.parse(req.body);

    const result = captchaService.verifyChallenge(challengeToken, selectedIndices);
    if (!result.success) {
      throw new AppError('CAPTCHA_VERIFICATION_FAILED', result.error || 'Incorrect selection', 400);
    }

    return res.status(200).json({
      success: true,
      data: {
        verified: true,
        captchaToken: result.captchaToken
      }
    });
  } catch (error: any) {
    next(error);
  }
}
