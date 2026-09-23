import { Schema, model, Document, Types } from 'mongoose';

export interface IFeeRuleCriteria {
  field: string;
  value: string;
}

export interface IFeeRule extends Document {
  institutionId: Types.ObjectId;
  name: string;
  feeType: string;
  academicYear: string;
  criteria: IFeeRuleCriteria[];
  amount: number;
  dueDate: Date;
  fineDate?: Date;
  fineAmount: number;
  isActive: boolean;
  appliedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const FeeRuleCriteriaSchema = new Schema<IFeeRuleCriteria>({
  field: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true }
}, { _id: false });

const FeeRuleSchema = new Schema<IFeeRule>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    name: { type: String, required: true, trim: true },
    feeType: { type: String, required: true, default: 'Tuition Fee', trim: true },
    academicYear: { type: String, required: true, trim: true },
    criteria: { type: [FeeRuleCriteriaSchema], default: [] },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    fineDate: { type: Date },
    fineAmount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    appliedCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

FeeRuleSchema.index({ institutionId: 1, isActive: 1 });

export const FeeRule = model<IFeeRule>('FeeRule', FeeRuleSchema);
