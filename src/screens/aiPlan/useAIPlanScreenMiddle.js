import { useAIPlanScreenInner } from './useAIPlanScreenInner'
import { useAIPlanScreenMiddlePartA } from './useAIPlanScreenMiddlePartA'
import { useAIPlanScreenMiddlePartB } from './useAIPlanScreenMiddlePartB'

export function useAIPlanScreenMiddle() {
  const inner = useAIPlanScreenInner()
  const midA = useAIPlanScreenMiddlePartA(inner)
  return useAIPlanScreenMiddlePartB(midA)
}
