import { Router } from 'express';
import {
  getStudents,
  getStudentDetail,
  createStudent,
  updateStudent,
  deleteStudent,
  batchSaveStudents,
  parseImportFile,
  bulkImportStudents,
  exportStudents,
  downloadImportTemplate
} from './studentController';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

// Specific action routes (MUST come before /:id)
router.get('/export', exportStudents);
router.get('/template', downloadImportTemplate);
router.post('/parse-file', parseImportFile);
router.post('/bulk-import', bulkImportStudents);
router.post('/batch-save', batchSaveStudents);

// Standard CRUD routes
router.get('/', getStudents);
router.post('/', createStudent);
router.get('/:id', getStudentDetail);
router.put('/:id', updateStudent);
router.delete('/:id', deleteStudent);

export const studentRoutes = router;

