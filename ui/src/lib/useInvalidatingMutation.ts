import {
  useMutation,
  useQueryClient,
  type MutationFunctionContext,
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

type InvalidationResolver<TData, TVariables, TOnMutateResult> =
  | QueryKey[]
  | ((
      data: TData,
      variables: TVariables,
      onMutateResult: TOnMutateResult,
      context: MutationFunctionContext,
    ) => QueryKey[] | Promise<QueryKey[]>);

type InvalidatingMutationOptions<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TOnMutateResult = unknown,
> = UseMutationOptions<TData, TError, TVariables, TOnMutateResult> & {
  invalidateQueryKeys?: InvalidationResolver<TData, TVariables, TOnMutateResult>;
  skipInvalidation?: boolean;
};

export function useInvalidatingMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TOnMutateResult = unknown,
>(
  options: InvalidatingMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  queryClient?: QueryClient,
): UseMutationResult<TData, TError, TVariables, TOnMutateResult> {
  const defaultQueryClient = useQueryClient();
  const invalidationClient = queryClient ?? defaultQueryClient;
  const { invalidateQueryKeys, skipInvalidation, onSuccess, ...mutationOptions } = options;

  return useMutation<TData, TError, TVariables, TOnMutateResult>(
    {
      ...mutationOptions,
      onSuccess: async (data, variables, onMutateResult, context) => {
        const onSuccessResult = onSuccess?.(data, variables, onMutateResult, context);
        if (skipInvalidation) {
          await onSuccessResult;
          return;
        }

        const queryKeys = typeof invalidateQueryKeys === "function"
          ? await invalidateQueryKeys(data, variables, onMutateResult, context)
          : invalidateQueryKeys;

        await onSuccessResult;
        if (queryKeys?.length) {
          await Promise.all(queryKeys.map((queryKey) => invalidationClient.invalidateQueries({ queryKey })));
        }
      },
    },
    queryClient,
  );
}
