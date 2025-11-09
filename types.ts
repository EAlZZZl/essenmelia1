export interface ProgressStep {
  id: string;
  description: string;
  timestamp: Date;
  completed: boolean;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  steps: ProgressStep[];
  imageUrl?: string;
  tags?: string[];
  hasOriginalImage?: boolean;
}

export interface StepTemplate {
  id:string;
  description: string;
}

export interface StepSetTemplateStep {
  id: string;
  description: string;
}

export interface StepSetTemplate {
  id: string;
  name: string;
  steps: StepSetTemplateStep[];
}
