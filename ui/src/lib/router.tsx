import * as React from "react";
import * as RouterDom from "react-router-dom";
import type { NavigateOptions, To } from "react-router-dom";
import type { Issue } from "@paperclipai/shared";
import { useCompany } from "@/context/CompanyContext";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  normalizeCompanyPrefix,
} from "@/lib/company-routes";
import { withIssueDetailHeaderSeed } from "@/lib/issueDetailBreadcrumb";
import { parseIssuePathIdFromPath } from "@/lib/issue-reference";

const IssueLinkQuicklook = React.lazy(() =>
  import("@/components/IssueLinkQuicklook").then((module) => ({ default: module.IssueLinkQuicklook })),
);

function resolveTo(to: To, companyPrefix: string | null): To {
  if (typeof to === "string") {
    return applyCompanyPrefix(to, companyPrefix);
  }

  if (to.pathname && to.pathname.startsWith("/")) {
    const pathname = applyCompanyPrefix(to.pathname, companyPrefix);
    if (pathname !== to.pathname) {
      return { ...to, pathname };
    }
  }

  return to;
}

function useActiveCompanyPrefix(): string | null {
  const { selectedCompany } = useCompany();
  const params = RouterDom.useParams<{ companyPrefix?: string }>();
  const location = RouterDom.useLocation();

  if (params.companyPrefix) {
    return normalizeCompanyPrefix(params.companyPrefix);
  }

  const pathPrefix = extractCompanyPrefixFromPath(location.pathname);
  if (pathPrefix) return pathPrefix;

  return selectedCompany ? normalizeCompanyPrefix(selectedCompany.issuePrefix) : null;
}

export {
  BrowserRouter,
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useBeforeUnload,
  useLocation,
  useNavigationType,
  useParams,
  useSearchParams,
} from "react-router-dom";

type CompanyLinkProps = React.ComponentProps<typeof RouterDom.Link> & {
  disableIssueQuicklook?: boolean;
  issuePrefetch?: Issue | null;
  issueQuicklookSide?: "top" | "right" | "bottom" | "left";
  issueQuicklookAlign?: "start" | "center" | "end";
  ref?: React.Ref<HTMLAnchorElement>;
};

type IssueQuicklookLinkProps = CompanyLinkProps & {
  issuePathId: string;
};

function IssueQuicklookLink({
  issuePathId,
  to,
  state,
  disableIssueQuicklook = false,
  issuePrefetch = null,
  issueQuicklookSide,
  issueQuicklookAlign,
  onMouseEnter,
  onFocus,
  onTouchStart,
  onClickCapture,
  ref,
  ...props
}: IssueQuicklookLinkProps) {
    const [armed, setArmed] = React.useState(false);
    const prefetchedState = issuePrefetch ? withIssueDetailHeaderSeed(state, issuePrefetch) : state;
    const armQuicklook = React.useCallback(() => setArmed(true), []);
    const fallbackLink = (
      <RouterDom.Link
        ref={ref}
        to={to}
        state={prefetchedState}
        onMouseEnter={(event) => {
          armQuicklook();
          onMouseEnter?.(event);
        }}
        onFocus={(event) => {
          armQuicklook();
          onFocus?.(event);
        }}
        onTouchStart={(event) => {
          armQuicklook();
          onTouchStart?.(event);
        }}
        onClickCapture={(event) => {
          armQuicklook();
          onClickCapture?.(event);
        }}
        {...props}
      />
    );

    if (disableIssueQuicklook || !armed) {
      return fallbackLink;
    }

    return (
      <React.Suspense fallback={fallbackLink}>
        <IssueLinkQuicklook
          ref={ref}
          to={to}
          state={state}
          issuePathId={issuePathId}
          issuePrefetch={issuePrefetch}
          issueQuicklookSide={issueQuicklookSide}
          issueQuicklookAlign={issueQuicklookAlign}
          onMouseEnter={onMouseEnter}
          onFocus={onFocus}
          onTouchStart={onTouchStart}
          onClickCapture={onClickCapture}
          {...props}
        />
      </React.Suspense>
    );
}

export function Link({
  to,
  disableIssueQuicklook = false,
  issuePrefetch = null,
  issueQuicklookSide,
  issueQuicklookAlign,
  ref,
  ...props
}: CompanyLinkProps) {
    const companyPrefix = useActiveCompanyPrefix();
    const resolvedTo = resolveTo(to, companyPrefix);
    const issuePathId = parseIssuePathIdFromPath(typeof resolvedTo === "string" ? resolvedTo : resolvedTo.pathname);

    if (issuePathId) {
      return (
        <IssueQuicklookLink
          ref={ref}
          to={resolvedTo}
          issuePathId={issuePathId}
          disableIssueQuicklook={disableIssueQuicklook}
          issuePrefetch={issuePrefetch}
          issueQuicklookSide={issueQuicklookSide}
          issueQuicklookAlign={issueQuicklookAlign}
          {...props}
        />
      );
    }

    return <RouterDom.Link ref={ref} to={resolvedTo} {...props} />;
}

export function NavLink({
  to,
  ref,
  ...props
}: React.ComponentProps<typeof RouterDom.NavLink> & { ref?: React.Ref<HTMLAnchorElement> }) {
  const companyPrefix = useActiveCompanyPrefix();
  return <RouterDom.NavLink ref={ref} to={resolveTo(to, companyPrefix)} {...props} />;
}

export function Navigate({ to, ...props }: React.ComponentProps<typeof RouterDom.Navigate>) {
  const companyPrefix = useActiveCompanyPrefix();
  return <RouterDom.Navigate to={resolveTo(to, companyPrefix)} {...props} />;
}

export function useNavigate(): ReturnType<typeof RouterDom.useNavigate> {
  const navigate = RouterDom.useNavigate();
  const companyPrefix = useActiveCompanyPrefix();

  return React.useCallback(
    ((to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        navigate(to);
        return;
      }
      navigate(resolveTo(to, companyPrefix), options);
    }) as ReturnType<typeof RouterDom.useNavigate>,
    [navigate, companyPrefix],
  );
}
