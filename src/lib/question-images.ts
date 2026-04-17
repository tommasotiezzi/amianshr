/**
 * Question images — concrete slot for the `question-images` bucket.
 *
 * Images uploaded via this slot appear above a question on both
 * the admin preview and the candidate-side quiz renderer.
 */

import { createImageSlot } from './image-upload';

export const questionImages = createImageSlot({
  bucket: 'question-images',
  maxWidth: 1600,
  quality: 0.85,
});