import { useReducer, useCallback } from 'react'

const INITIAL_STATES = { fetch: false, build: false, nature: false, generate: false }

const initialState = {
  states: INITIAL_STATES,
  loadingStep: null,
  error: '',
}

function reducer(state, action) {
  switch (action.type) {
    case 'START_LOADING':
      return { ...state, loadingStep: action.step, error: '' }
    case 'STOP_LOADING':
      return { ...state, loadingStep: null }
    case 'COMPLETE_STEP':
      return { ...state, states: { ...state.states, [action.step]: true } }
    case 'SET_ERROR':
      return { ...state, error: action.error, loadingStep: null }
    case 'RESET':
      return { ...initialState, states: { ...INITIAL_STATES } }
    case 'INVALIDATE_AFTER': {
      const next = { ...state.states }
      action.steps.forEach(s => { next[s] = false })
      return { ...state, states: next }
    }
    default:
      return state
  }
}

export function usePipelineState() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const startLoading = useCallback((step) => {
    dispatch({ type: 'START_LOADING', step })
  }, [])

  const stopLoading = useCallback(() => {
    dispatch({ type: 'STOP_LOADING' })
  }, [])

  const completeStep = useCallback((step) => {
    dispatch({ type: 'COMPLETE_STEP', step })
  }, [])

  const setError = useCallback((error) => {
    dispatch({ type: 'SET_ERROR', error })
  }, [])

  const resetPipeline = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  const invalidateSteps = useCallback((steps) => {
    dispatch({ type: 'INVALIDATE_AFTER', steps })
  }, [])

  return {
    states: state.states,
    loadingStep: state.loadingStep,
    error: state.error,
    startLoading,
    stopLoading,
    completeStep,
    setError,
    resetPipeline,
    invalidateSteps,
  }
}
