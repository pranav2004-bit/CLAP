import { apiClient } from './client';

export interface Answer {
  question_id: string;
  answer: string | number | string[];
  timestamp: string;
}

export interface AnswerSubmission {
  attempt_id: string;
  answers: Record<string, Answer>;
}

export interface AnswerSaveResponse {
  success: boolean;
  message: string;
  saved_answers: Answer[];
}

/**
 * Save individual answer for a question
 */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  answer: string | number | string[]
): Promise<any> {
  try {
    return await apiClient.saveAnswer(attemptId, questionId, answer);
  } catch (error) {
    console.error('Error saving answer:', error);
    throw error;
  }
}

/**
 * Save multiple answers at once (batch save)
 */
export async function saveMultipleAnswers(
  attemptId: string,
  answers: Record<string, string | number | string[]>
): Promise<any> {
  try {
    return await apiClient.saveMultipleAnswers(attemptId, answers);
  } catch (error) {
    console.error('Error saving multiple answers:', error);
    throw error;
  }
}

/**
 * Get all answers for an attempt
 */
export async function getAttemptAnswers(attemptId: string): Promise<Record<string, any>> {
  try {
    return await apiClient.getAttemptAnswers(attemptId);
  } catch (error) {
    console.error('Error fetching attempt answers:', error);
    throw error;
  }
}

/**
 * Submit final answers (mark attempt as completed)
 */
export async function submitAnswers(attemptId: string): Promise<any> {
  try {
    return await apiClient.updateAttempt(attemptId, { status: 'completed' });
  } catch (error) {
    console.error('Error submitting answers:', error);
    throw error;
  }
}

/**
 * Clear an answer for a specific question
 */
export async function clearAnswer(attemptId: string, questionId: string): Promise<any> {
  try {
    return await apiClient.clearAnswer(attemptId, questionId);
  } catch (error) {
    console.error('Error clearing answer:', error);
    throw error;
  }
}