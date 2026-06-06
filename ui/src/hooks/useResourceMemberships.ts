import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ResourceMembershipResourceType,
  ResourceMembershipState,
  ResourceMemberships,
} from "@paperclipai/shared";
import { resourceMembershipsApi } from "../api/resourceMemberships";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";

type MutationVariables = {
  resourceType: ResourceMembershipResourceType;
  resourceId: string;
  resourceName: string;
  state: ResourceMembershipState;
};

function emptyMemberships(): ResourceMemberships {
  return {
    projectMemberships: {},
    agentMemberships: {},
    updatedAt: null,
  };
}

function applyMembershipState(
  current: ResourceMemberships | undefined,
  resourceType: ResourceMembershipResourceType,
  resourceId: string,
  state: ResourceMembershipState,
): ResourceMemberships {
  const base = current ?? emptyMemberships();
  if (resourceType === "project") {
    return {
      ...base,
      projectMemberships: {
        ...base.projectMemberships,
        [resourceId]: state,
      },
      updatedAt: new Date(),
    };
  }
  return {
    ...base,
    agentMemberships: {
      ...base.agentMemberships,
      [resourceId]: state,
    },
    updatedAt: new Date(),
  };
}

export function restoreMembershipState(
  current: ResourceMemberships | undefined,
  previous: ResourceMemberships | undefined,
  resourceType: ResourceMembershipResourceType,
  resourceId: string,
): ResourceMemberships {
  const base = current ?? emptyMemberships();
  if (resourceType === "project") {
    const projectMemberships = { ...base.projectMemberships };
    if (previous?.projectMemberships[resourceId] === undefined) {
      delete projectMemberships[resourceId];
    } else {
      projectMemberships[resourceId] = previous.projectMemberships[resourceId]!;
    }
    return { ...base, projectMemberships, updatedAt: new Date() };
  }
  const agentMemberships = { ...base.agentMemberships };
  if (previous?.agentMemberships[resourceId] === undefined) {
    delete agentMemberships[resourceId];
  } else {
    agentMemberships[resourceId] = previous.agentMemberships[resourceId]!;
  }
  return { ...base, agentMemberships, updatedAt: new Date() };
}

export function resourceMembershipState(
  memberships: ResourceMemberships | undefined,
  resourceType: ResourceMembershipResourceType,
  resourceId: string,
): ResourceMembershipState {
  const state = resourceType === "project"
    ? memberships?.projectMemberships[resourceId]
    : memberships?.agentMemberships[resourceId];
  return state === "left" ? "left" : "joined";
}

export function useResourceMemberships(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.resourceMemberships.mine(companyId ?? "__none__"),
    queryFn: () => resourceMembershipsApi.listMine(companyId!),
    enabled: !!companyId,
  });
}

export function useResourceMembershipMutation(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const queryKey = queryKeys.resourceMemberships.mine(companyId ?? "__none__");

  return useMutation({
    mutationFn: (variables: MutationVariables) => {
      if (!companyId) throw new Error("Select a company first.");
      return variables.resourceType === "project"
        ? resourceMembershipsApi.updateProject(companyId, variables.resourceId, { state: variables.state })
        : resourceMembershipsApi.updateAgent(companyId, variables.resourceId, { state: variables.state });
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ResourceMemberships>(queryKey);
      const optimistic = applyMembershipState(previous, variables.resourceType, variables.resourceId, variables.state);
      queryClient.setQueryData<ResourceMemberships>(
        queryKey,
        optimistic,
      );
      return { previous, optimistic };
    },
    onError: (error, variables, context) => {
      if (context?.optimistic) {
        const current = queryClient.getQueryData<ResourceMemberships>(queryKey);
        const currentState = resourceMembershipState(current, variables.resourceType, variables.resourceId);
        const optimisticState = resourceMembershipState(context.optimistic, variables.resourceType, variables.resourceId);
        if (currentState === optimisticState) {
          queryClient.setQueryData<ResourceMemberships>(
            queryKey,
            (latest) => restoreMembershipState(latest, context.previous, variables.resourceType, variables.resourceId),
          );
        }
      }
      const verb = variables.state === "left" ? "leave" : "join";
      pushToast({
        title: `Couldn't ${verb} ${variables.resourceName}.`,
        body: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData<ResourceMemberships>(
        queryKey,
        (current) => applyMembershipState(current, variables.resourceType, result.resourceId, result.state),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
