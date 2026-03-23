#!/usr/bin/env node
/**
 * Seed Data Script for CLAP Application
 * Populates the database with sample data for testing and development
 */

import { createHash } from 'crypto';

// Types matching our database schema
interface User {
  id: string;
  email: string;
  role: 'student' | 'admin';
  full_name: string;
  created_at: string;
}

interface Test {
  id: string;
  name: string;
  type: 'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary';
  duration_minutes: number;
  total_questions: number;
  instructions: string;
  created_at: string;
}

interface Question {
  id: string;
  test_id: string;
  question_text: string;
  question_type: 'mcq' | 'fill_blank' | 'essay' | 'audio_response';
  options?: string[];
  correct_answer: string;
  audio_url?: string;
  image_url?: string;
  points: number;
  order_index: number;
  created_at: string;
}

interface TestAttempt {
  id: string;
  user_id: string;
  test_id: string;
  started_at: string;
  completed_at?: string;
  score?: number;
  max_score?: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  answers?: Record<string, any>;
  created_at: string;
}

// Generate deterministic IDs based on content for consistency
function generateId(content: string): string {
  return createHash('md5').update(content).digest('hex').substring(0, 8);
}

// Sample Users
const sampleUsers: User[] = [
  {
    id: generateId('admin@admin.com'),
    email: 'admin@admin.com',
    role: 'admin',
    full_name: 'Admin User',
    created_at: new Date().toISOString()
  },
  {
    id: generateId('student1@example.com'),
    email: 'student1@example.com',
    role: 'student',
    full_name: 'Alice Johnson',
    created_at: new Date().toISOString()
  },
  {
    id: generateId('student2@example.com'),
    email: 'student2@example.com',
    role: 'student',
    full_name: 'Bob Smith',
    created_at: new Date().toISOString()
  },
  {
    id: generateId('student3@example.com'),
    email: 'student3@example.com',
    role: 'student',
    full_name: 'Carol Williams',
    created_at: new Date().toISOString()
  },
  {
    id: generateId('student4@example.com'),
    email: 'student4@example.com',
    role: 'student',
    full_name: 'David Brown',
    created_at: new Date().toISOString()
  }
];

// Sample Tests (matching existing mock data structure)
const sampleTests: Test[] = [
  {
    id: '1',
    name: 'Listening Test',
    type: 'listening',
    duration_minutes: 20,
    total_questions: 10,
    instructions: 'You will hear an audio recording. Each audio clip can be played a maximum of 2 times. Questions will appear at specific timestamps. Select the best answer for each question.',
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Speaking Test',
    type: 'speaking',
    duration_minutes: 15,
    total_questions: 5,
    instructions: 'Record your responses to the speaking prompts. Speak clearly and at a natural pace. You will have 30 seconds to prepare and 60 seconds to record each response.',
    created_at: new Date().toISOString()
  },
  {
    id: '3',
    name: 'Reading Test',
    type: 'reading',
    duration_minutes: 30,
    total_questions: 12,
    instructions: 'Read the passage and answer the comprehension questions. The passage remains visible throughout the test. Choose the best answer for each question.',
    created_at: new Date().toISOString()
  },
  {
    id: '4',
    name: 'Writing Test',
    type: 'writing',
    duration_minutes: 45,
    total_questions: 2,
    instructions: 'Write essays in response to the prompts. Your writing will be evaluated for grammar, vocabulary, organization, and coherence. Spend approximately 20 minutes on each essay.',
    created_at: new Date().toISOString()
  },
  {
    id: '5',
    name: 'Verbal Ability Test',
    type: 'vocabulary',
    duration_minutes: 25,
    total_questions: 15,
    instructions: 'Complete the fill-in-the-blank and multiple-choice questions testing vocabulary and grammar. Choose the best option or type the correct word.',
    created_at: new Date().toISOString()
  }
];

// Sample Questions for each test type
const sampleQuestions: Question[] = [
  // Listening Test Questions (10 questions)
  {
    id: generateId('listening-q1'),
    test_id: '1',
    question_text: "What is the main topic of the conversation?",
    question_type: 'mcq',
    options: [
      "A job interview discussion",
      "A university admission process",
      "A travel planning session",
      "A medical appointment"
    ],
    correct_answer: "A university admission process",
    points: 1,
    order_index: 1,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('listening-q2'),
    test_id: '1',
    question_text: "According to the speaker, what is the most important quality for success?",
    question_type: 'mcq',
    options: [
      "Technical skills",
      "Communication ability",
      "Persistence and dedication",
      "Financial resources"
    ],
    correct_answer: "Persistence and dedication",
    points: 1,
    order_index: 2,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('listening-q3'),
    test_id: '1',
    question_text: "How long does the application process typically take?",
    question_type: 'mcq',
    options: [
      "2 weeks",
      "1 month",
      "2-3 months",
      "6 months"
    ],
    correct_answer: "2-3 months",
    points: 1,
    order_index: 3,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('listening-q4'),
    test_id: '1',
    question_text: "What documents are mentioned as required?",
    question_type: 'mcq',
    options: [
      "Passport and photos",
      "Transcripts and recommendation letters",
      "Bank statements",
      "All of the above"
    ],
    correct_answer: "All of the above",
    points: 1,
    order_index: 4,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('listening-q5'),
    test_id: '1',
    question_text: "Fill in the blank: The speaker emphasizes the importance of _______ throughout the process.",
    question_type: 'fill_blank',
    correct_answer: "preparation",
    points: 1,
    order_index: 5,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('listening-q6'),
    test_id: '1',
    question_text: "What advice does the speaker give about interviews?",
    question_type: 'mcq',
    options: [
      "Be overly confident",
      "Research the institution thoroughly",
      "Arrive late to seem important",
      "Dress casually"
    ],
    correct_answer: "Research the institution thoroughly",
    points: 1,
    order_index: 6,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('listening-q7'),
    test_id: '1',
    question_text: "True or False: Financial aid options are discussed in detail.",
    question_type: 'mcq',
    options: ["True", "False"],
    correct_answer: "False",
    points: 1,
    order_index: 7,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('listening-q8'),
    test_id: '1',
    question_text: "What should applicants do if they have questions?",
    question_type: 'mcq',
    options: [
      "Guess the answers",
      "Contact the admissions office",
      "Skip the difficult questions",
      "Copy from others"
    ],
    correct_answer: "Contact the admissions office",
    points: 1,
    order_index: 8,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('listening-q9'),
    test_id: '1',
    question_text: "The speaker recommends starting the application process _______.",
    question_type: 'fill_blank',
    correct_answer: "early",
    points: 1,
    order_index: 9,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('listening-q10'),
    test_id: '1',
    question_text: "Which of the following is NOT mentioned as part of the process?",
    question_type: 'mcq',
    options: [
      "Entrance exams",
      "Personal statement",
      "Interview preparation",
      "Social media profile review"
    ],
    correct_answer: "Social media profile review",
    points: 1,
    order_index: 10,
    created_at: new Date().toISOString()
  },

  // Speaking Test Questions (5 questions)
  {
    id: generateId('speaking-q1'),
    test_id: '2',
    question_text: "Describe your favorite book and explain why you enjoyed it. (60 seconds)",
    question_type: 'audio_response',
    correct_answer: "Sample response would discuss a book with clear reasons for enjoyment",
    points: 2,
    order_index: 1,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('speaking-q2'),
    test_id: '2',
    question_text: "Talk about a memorable trip you've taken and what you learned from it. (60 seconds)",
    question_type: 'audio_response',
    correct_answer: "Sample response would describe a trip with educational value",
    points: 2,
    order_index: 2,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('speaking-q3'),
    test_id: '2',
    question_text: "Discuss the advantages and disadvantages of online learning compared to traditional classroom learning. (60 seconds)",
    question_type: 'audio_response',
    correct_answer: "Sample response would balance pros and cons of both approaches",
    points: 2,
    order_index: 3,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('speaking-q4'),
    test_id: '2',
    question_text: "Describe your dream job and explain the steps you would take to achieve it. (60 seconds)",
    question_type: 'audio_response',
    correct_answer: "Sample response would outline career goals and actionable steps",
    points: 2,
    order_index: 4,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('speaking-q5'),
    test_id: '2',
    question_text: "Talk about an important decision you had to make and how you approached it. (60 seconds)",
    question_type: 'audio_response',
    correct_answer: "Sample response would demonstrate decision-making process",
    points: 2,
    order_index: 5,
    created_at: new Date().toISOString()
  },

  // Reading Test Questions (12 questions)
  {
    id: generateId('reading-q1'),
    test_id: '3',
    question_text: "What is the main theme of the passage?",
    question_type: 'mcq',
    options: [
      "Technology advancement",
      "Environmental conservation",
      "Educational reform",
      "Healthcare improvement"
    ],
    correct_answer: "Technology advancement",
    points: 1,
    order_index: 1,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q2'),
    test_id: '3',
    question_text: "According to the author, what is the primary benefit of artificial intelligence?",
    question_type: 'mcq',
    options: [
      "Reducing human workload",
      "Eliminating jobs entirely",
      "Creating more complex problems",
      "Slowing down progress"
    ],
    correct_answer: "Reducing human workload",
    points: 1,
    order_index: 2,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q3'),
    test_id: '3',
    question_text: "Fill in the blank: The article suggests that AI will _______ rather than replace human workers.",
    question_type: 'fill_blank',
    correct_answer: "augment",
    points: 1,
    order_index: 3,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q4'),
    test_id: '3',
    question_text: "What concern does the passage raise about rapid technological change?",
    question_type: 'mcq',
    options: [
      "It happens too slowly",
      "People may struggle to adapt",
      "It's always beneficial",
      "There's no regulation needed"
    ],
    correct_answer: "People may struggle to adapt",
    points: 1,
    order_index: 4,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q5'),
    test_id: '3',
    question_text: "True or False: The author believes technology eliminates the need for human creativity.",
    question_type: 'mcq',
    options: ["True", "False"],
    correct_answer: "False",
    points: 1,
    order_index: 5,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q6'),
    test_id: '3',
    question_text: "What example does the passage give of successful human-AI collaboration?",
    question_type: 'mcq',
    options: [
      "Automated factories",
      "Medical diagnosis assistance",
      "Self-driving cars only",
      "Replacing teachers entirely"
    ],
    correct_answer: "Medical diagnosis assistance",
    points: 1,
    order_index: 6,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q7'),
    test_id: '3',
    question_text: "The author emphasizes the importance of _______ in the age of automation.",
    question_type: 'fill_blank',
    correct_answer: "adaptability",
    points: 1,
    order_index: 7,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q8'),
    test_id: '3',
    question_text: "What skill does the passage identify as increasingly valuable?",
    question_type: 'mcq',
    options: [
      "Manual labor",
      "Critical thinking and problem-solving",
      "Following instructions exactly",
      "Avoiding technology"
    ],
    correct_answer: "Critical thinking and problem-solving",
    points: 1,
    order_index: 8,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q9'),
    test_id: '3',
    question_text: "According to the passage, how should education systems respond to technological changes?",
    question_type: 'mcq',
    options: [
      "Ignore them completely",
      "Focus only on traditional subjects",
      "Adapt curriculum to include digital literacy",
      "Eliminate technology courses"
    ],
    correct_answer: "Adapt curriculum to include digital literacy",
    points: 1,
    order_index: 9,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q10'),
    test_id: '3',
    question_text: "What does the author suggest about future job markets?",
    question_type: 'mcq',
    options: [
      "They will disappear entirely",
      "They will require different skills",
      "They will remain unchanged",
      "They will favor low-skilled workers"
    ],
    correct_answer: "They will require different skills",
    points: 1,
    order_index: 10,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q11'),
    test_id: '3',
    question_text: "Fill in the blank: The passage argues for a _______ approach to technological integration.",
    question_type: 'fill_blank',
    correct_answer: "balanced",
    points: 1,
    order_index: 11,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('reading-q12'),
    test_id: '3',
    question_text: "What is the author's overall tone toward technological advancement?",
    question_type: 'mcq',
    options: [
      "Completely negative",
      "Cautiously optimistic",
      "Indifferent",
      "Overly enthusiastic"
    ],
    correct_answer: "Cautiously optimistic",
    points: 1,
    order_index: 12,
    created_at: new Date().toISOString()
  },

  // Writing Test Prompts (2 essays)
  {
    id: generateId('writing-q1'),
    test_id: '4',
    question_text: "Some people believe that technology has made our lives more complicated rather than simpler. To what extent do you agree or disagree with this statement? Support your opinion with specific examples and reasoning. (Approximately 300-350 words)",
    question_type: 'essay',
    correct_answer: "Well-structured essay with clear thesis, supporting arguments, and examples",
    points: 10,
    order_index: 1,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('writing-q2'),
    test_id: '4',
    question_text: "Education systems around the world are struggling to prepare students for a rapidly changing job market. What changes do you think are most important for schools to implement? Discuss the challenges and benefits of these changes. (Approximately 300-350 words)",
    question_type: 'essay',
    correct_answer: "Well-structured essay addressing educational reform with practical suggestions",
    points: 10,
    order_index: 2,
    created_at: new Date().toISOString()
  },

  // Vocabulary & Grammar Questions (15 questions)
  {
    id: generateId('vocab-q1'),
    test_id: '5',
    question_text: "Choose the correct word: The _______ of the new policy caused significant debate among stakeholders.",
    question_type: 'mcq',
    options: ["introduction", "introduced", "introductory", "introduce"],
    correct_answer: "introduction",
    points: 1,
    order_index: 1,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q2'),
    test_id: '5',
    question_text: "Fill in the blank: Despite the _______ weather, the outdoor event proceeded as planned.",
    question_type: 'fill_blank',
    correct_answer: "inclement",
    points: 1,
    order_index: 2,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q3'),
    test_id: '5',
    question_text: "Which sentence is grammatically correct?",
    question_type: 'mcq',
    options: [
      "She don't like coffee.",
      "She doesn't likes coffee.",
      "She doesn't like coffee.",
      "She not like coffee."
    ],
    correct_answer: "She doesn't like coffee.",
    points: 1,
    order_index: 3,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q4'),
    test_id: '5',
    question_text: "Choose the best synonym: The politician's _______ speech failed to convince the audience.",
    question_type: 'mcq',
    options: ["convincing", "persuasive", "boring", "eloquent"],
    correct_answer: "boring",
    points: 1,
    order_index: 4,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q5'),
    test_id: '5',
    question_text: "Fill in the blank: The company decided to _______ the project due to budget constraints.",
    question_type: 'fill_blank',
    correct_answer: "postpone",
    points: 1,
    order_index: 5,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q6'),
    test_id: '5',
    question_text: "Identify the error in this sentence: 'Each of the students have completed their assignments.'",
    question_type: 'mcq',
    options: [
      "No error",
      "have should be has",
      "their should be his or her",
      "completed should be complete"
    ],
    correct_answer: "have should be has",
    points: 1,
    order_index: 6,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q7'),
    test_id: '5',
    question_text: "Choose the correct preposition: She is proficient _______ playing the piano.",
    question_type: 'mcq',
    options: ["in", "on", "at", "with"],
    correct_answer: "in",
    points: 1,
    order_index: 7,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q8'),
    test_id: '5',
    question_text: "Fill in the blank: The _______ between supply and demand determines market prices.",
    question_type: 'fill_blank',
    correct_answer: "relationship",
    points: 1,
    order_index: 8,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q9'),
    test_id: '5',
    question_text: "Which word best completes the sentence: 'His _______ explanation helped clarify the complex concept.'",
    question_type: 'mcq',
    options: ["confusing", "verbose", "lucid", "ambiguous"],
    correct_answer: "lucid",
    points: 1,
    order_index: 9,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q10'),
    test_id: '5',
    question_text: "Correct the sentence: 'Me and him went to the store yesterday.'",
    question_type: 'mcq',
    options: [
      "No correction needed",
      "Him and me went to the store yesterday.",
      "He and I went to the store yesterday.",
      "I and him went to the store yesterday."
    ],
    correct_answer: "He and I went to the store yesterday.",
    points: 1,
    order_index: 10,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q11'),
    test_id: '5',
    question_text: "Fill in the blank: The _______ of the meeting was to discuss quarterly results.",
    question_type: 'fill_blank',
    correct_answer: "purpose",
    points: 1,
    order_index: 11,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q12'),
    test_id: '5',
    question_text: "Choose the correct verb form: By next year, she _______ her degree.",
    question_type: 'mcq',
    options: ["will complete", "will have completed", "completes", "completed"],
    correct_answer: "will have completed",
    points: 1,
    order_index: 12,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q13'),
    test_id: '5',
    question_text: "Which sentence demonstrates proper parallel structure?",
    question_type: 'mcq',
    options: [
      "She likes hiking, swimming, and to read books.",
      "She likes hiking, swimming, and reading books.",
      "She likes to hike, swim, and books to read.",
      "She likes hike, swim, and reading books."
    ],
    correct_answer: "She likes hiking, swimming, and reading books.",
    points: 1,
    order_index: 13,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q14'),
    test_id: '5',
    question_text: "Fill in the blank: The new regulations were implemented to _______ workplace safety.",
    question_type: 'fill_blank',
    correct_answer: "enhance",
    points: 1,
    order_index: 14,
    created_at: new Date().toISOString()
  },
  {
    id: generateId('vocab-q15'),
    test_id: '5',
    question_text: "Identify the correctly punctuated sentence:",
    question_type: 'mcq',
    options: [
      "The students who studied hard, passed the exam.",
      "The students, who studied hard, passed the exam.",
      "The students who studied hard passed the exam.",
      "The students who studied hard: passed the exam."
    ],
    correct_answer: "The students who studied hard passed the exam.",
    points: 1,
    order_index: 15,
    created_at: new Date().toISOString()
  }
];

// Sample Test Attempts
const sampleAttempts: TestAttempt[] = [
  // Alice's attempts
  {
    id: generateId('attempt-alice-listening'),
    user_id: sampleUsers[1].id,
    test_id: '1',
    started_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    completed_at: new Date(Date.now() - 85200000).toISOString(), // 1 day ago + 20 min
    score: 8,
    max_score: 10,
    status: 'completed',
    answers: {
      '1': 1,
      '2': 2,
      '3': 2,
      '4': 3,
      '5': 'preparation',
      '6': 1,
      '7': 1,
      '8': 1,
      '9': 'early',
      '10': 3
    },
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: generateId('attempt-alice-reading'),
    user_id: sampleUsers[1].id,
    test_id: '3',
    started_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    completed_at: new Date(Date.now() - 171000000).toISOString(), // 2 days ago + 30 min
    score: 10,
    max_score: 12,
    status: 'completed',
    answers: {
      '1': 0,
      '2': 0,
      '3': 'augment',
      '4': 1,
      '5': 1,
      '6': 1,
      '7': 'adaptability',
      '8': 1,
      '9': 2,
      '10': 1,
      '11': 'balanced',
      '12': 1
    },
    created_at: new Date(Date.now() - 172800000).toISOString()
  },
  
  // Bob's attempts
  {
    id: generateId('attempt-bob-vocabulary'),
    user_id: sampleUsers[2].id,
    test_id: '5',
    started_at: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
    completed_at: new Date(Date.now() - 257700000).toISOString(), // 3 days ago + 25 min
    score: 12,
    max_score: 15,
    status: 'completed',
    answers: {
      '1': 0,
      '2': 'inclement',
      '3': 2,
      '4': 2,
      '5': 'postpone',
      '6': 1,
      '7': 0,
      '8': 'relationship',
      '9': 2,
      '10': 2,
      '11': 'purpose',
      '12': 1,
      '13': 1,
      '14': 'enhance',
      '15': 2
    },
    created_at: new Date(Date.now() - 259200000).toISOString()
  },
  
  // Carol's in-progress attempt
  {
    id: generateId('attempt-carol-writing'),
    user_id: sampleUsers[3].id,
    test_id: '4',
    started_at: new Date().toISOString(),
    completed_at: undefined,
    score: undefined,
    max_score: 20,
    status: 'in_progress',
    answers: {
      '1': 'Technology has certainly made some aspects of our lives more convenient, but it has also introduced new complexities...',
      '2': ''
    },
    created_at: new Date().toISOString()
  },
  
  // David's abandoned attempt
  {
    id: generateId('attempt-david-speaking'),
    user_id: sampleUsers[4].id,
    test_id: '2',
    started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    completed_at: undefined,
    score: undefined,
    max_score: 10,
    status: 'abandoned',
    answers: {
      '1': 'My favorite book is...'
    },
    created_at: new Date(Date.now() - 3600000).toISOString()
  }
];

// Export the data
export const seedData = {
  users: sampleUsers,
  tests: sampleTests,
  questions: sampleQuestions,
  attempts: sampleAttempts
};

// Function to reset and re-seed data
export async function seedDatabase(reset: boolean = false) {
  console.log('🌱 Seeding database with sample data...');
  
  if (reset) {
    console.log('🗑️  Resetting existing data...');
    // In a real implementation, this would clear existing data
  }
  
  console.log(`👤 Seeding ${sampleUsers.length} users...`);
  console.log(`📝 Seeding ${sampleTests.length} tests...`);
  console.log(`❓ Seeding ${sampleQuestions.length} questions...`);
  console.log(`📊 Seeding ${sampleAttempts.length} test attempts...`);
  
  // In a real implementation, this would insert data into the database
  // For now, we're just exporting the data structure
  
  console.log('✅ Seed data ready!');
  console.log('\n📊 Summary:');
  console.log(`  - Users: ${sampleUsers.length}`);
  console.log(`  - Tests: ${sampleTests.length}`);
  console.log(`  - Questions: ${sampleQuestions.length}`);
  console.log(`  - Attempts: ${sampleAttempts.length}`);
  console.log(`  - Total Questions by Type:`);
  console.log(`    • MCQ: ${sampleQuestions.filter(q => q.question_type === 'mcq').length}`);
  console.log(`    • Fill-in-blank: ${sampleQuestions.filter(q => q.question_type === 'fill_blank').length}`);
  console.log(`    • Essay: ${sampleQuestions.filter(q => q.question_type === 'essay').length}`);
  console.log(`    • Audio Response: ${sampleQuestions.filter(q => q.question_type === 'audio_response').length}`);
  
  return seedData;
}

// For direct execution, uncomment the following lines:
// const reset = process.argv.includes('--reset');
// seedDatabase(reset).catch(console.error);

// Or import and use in other files:
// import { seedDatabase } from './seed';
// await seedDatabase(true);

export default seedData;