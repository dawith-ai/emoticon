/**
 * Undo/Redo 히스토리 — 레이어별 ImageData 스냅샷.
 *
 * stroke 끝날 때마다 commit 호출 → 모든 활성 레이어의 ImageData를 저장.
 * 메모리 부담을 줄이기 위해 30개로 제한. 초과 시 가장 오래된 항목 폐기.
 */

export type LayerSnapshot = {
  layerId: string;
  imageData: ImageData;
};

type Frame = LayerSnapshot[];

const MAX_HISTORY = 30;

export class CanvasHistory {
  private undoStack: Frame[] = [];
  private redoStack: Frame[] = [];

  commit(frame: Frame): void {
    this.undoStack.push(frame);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(currentFrame: Frame): Frame | null {
    if (this.undoStack.length === 0) return null;
    const previous = this.undoStack.pop()!;
    this.redoStack.push(currentFrame);
    return previous;
  }

  redo(currentFrame: Frame): Frame | null {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push(currentFrame);
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
