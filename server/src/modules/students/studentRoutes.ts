import { Router } from 'express';
import { getStudents, getStudentDetail } from './studentController';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', getStudents);
router.get('/:id', getStudentDetail);

export const studentRoutes = router;
