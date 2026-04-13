export const END = '__END__' as const;

export interface GraphNodeResult<TState> {
  patch?: Partial<TState>;
  next?: string;
}

export type GraphNodeHandler<TState, TContext> = (
  state: TState,
  context: TContext,
) => Promise<GraphNodeResult<TState> | void> | GraphNodeResult<TState> | void;

type EdgeResolver<TState> = (state: TState) => string;

interface ConditionalRoute<TState> {
  resolver: EdgeResolver<TState>;
  routes: Record<string, string>;
}

export interface CompiledStateGraph<TState, TContext> {
  invoke(initialState: TState, context: TContext): Promise<TState>;
}

export interface CompileGraphInput<TState> {
  startNode: string;
  maxSteps?: number;
  validateState?: (state: TState) => string[];
}

export class StateGraph<TState, TContext> {
  private readonly nodes = new Map<string, GraphNodeHandler<TState, TContext>>();
  private readonly directEdges = new Map<string, string>();
  private readonly conditionalEdges = new Map<string, ConditionalRoute<TState>>();

  addNode(name: string, handler: GraphNodeHandler<TState, TContext>) {
    this.nodes.set(name, handler);
    return this;
  }

  addEdge(from: string, to: string) {
    this.directEdges.set(from, to);
    return this;
  }

  addConditionalEdges(
    from: string,
    resolver: EdgeResolver<TState>,
    routes: Record<string, string>,
  ) {
    this.conditionalEdges.set(from, {
      resolver,
      routes,
    });
    return this;
  }

  compile(input: CompileGraphInput<TState>): CompiledStateGraph<TState, TContext> {
    const maxSteps = Math.max(1, input.maxSteps ?? 40);

    const assertValidState = (state: TState, phase: 'initial' | 'pre-node' | 'post-node', node: string) => {
      if (!input.validateState) {
        return;
      }

      const errors = input.validateState(state);
      if (errors.length > 0) {
        throw new Error(
          `StateGraph validation failed at ${phase} for node ${node}: ${errors.join('; ')}`,
        );
      }
    };

    return {
      invoke: async (initialState: TState, context: TContext) => {
        let state = { ...initialState };
        let currentNode = input.startNode;
        let stepCount = 0;

        assertValidState(state, 'initial', input.startNode);

        while (currentNode !== END) {
          stepCount += 1;

          if (stepCount > maxSteps) {
            throw new Error(`StateGraph exceeded max steps (${maxSteps}).`);
          }

          assertValidState(state, 'pre-node', currentNode);

          const handler = this.nodes.get(currentNode);
          if (!handler) {
            throw new Error(`Missing graph node handler: ${currentNode}`);
          }

          const nodeResult = (await handler(state, context)) ?? {};

          if (nodeResult.patch) {
            state = {
              ...state,
              ...nodeResult.patch,
            };

            assertValidState(state, 'post-node', currentNode);
          }

          if (nodeResult.next) {
            currentNode = nodeResult.next;
            continue;
          }

          const conditional = this.conditionalEdges.get(currentNode);
          if (conditional) {
            const edgeKey = conditional.resolver(state);
            const mapped = conditional.routes[edgeKey];

            if (!mapped) {
              throw new Error(
                `No conditional edge for node ${currentNode} and key ${edgeKey}.`,
              );
            }

            currentNode = mapped;
            continue;
          }

          const direct = this.directEdges.get(currentNode);

          if (!direct) {
            throw new Error(`No outgoing edge registered for node: ${currentNode}`);
          }

          currentNode = direct;
        }

        return state;
      },
    };
  }
}