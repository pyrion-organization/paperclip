import * as React from "react";
import * as RouterDom from "react-router-dom";
import type { NavigateOptions, To } from "react-router-dom";
import type { Issue } from "@paperclipai/shared";
import { useCompany } from "@/context/CompanyContext";
import { IssueLinkQuicklook } from "@/components/IssueLinkQuicklook";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  normalizeCompanyPrefix,
} from "@/lib/company-routes";
import { parseIssuePathIdFromPath } from "@/lib/issue-reference";
import { withIssueDetailHeaderSeed } from "@/lib/issueDetailBreadcrumb";

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

export * from "react-router-dom";

type CompanyLinkProps = React.ComponentProps<typeof RouterDom.Link> & {
  disableIssueQuicklook?: boolean;
  issuePrefetch?: Issue | null;
  issueQuicklookSide?: React.ComponentProps<typeof IssueLinkQuicklook>["issueQuicklookSide"];
  issueQuicklookAlign?: React.ComponentProps<typeof IssueLinkQuicklook>["issueQuicklookAlign"];
};

const LazyIssueLinkQuicklook = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<typeof IssueLinkQuicklook>
>(function LazyIssueLinkQuicklook(
  {
    issuePathId,
    to,
    children,
    state,
    disableIssueQuicklook: _disableIssueQuicklook,
    issuePrefetch = null,
    issueQuicklookSide,
    issueQuicklookAlign,
    initialOpen: _initialOpen,
    onMouseEnter,
    onFocus,
    onTouchStart,
    onClickCapture,
    ...props
  },
  ref,
) {
  const [armed, setArmed] = React.useState(false);
  const [initialOpen, setInitialOpen] = React.useState(false);
  const prefetchedState = issuePrefetch ? withIssueDetailHeaderSeed(state, issuePrefetch) : state;

  const armQuicklook = React.useCallback((open: boolean) => {
    setInitialOpen(open);
    setArmed(true);
  }, []);

  if (armed) {
    return (
      <IssueLinkQuicklook
        ref={ref}
        to={to}
        issuePathId={issuePathId}
        state={state}
        issuePrefetch={issuePrefetch}
        issueQuicklookSide={issueQuicklookSide}
        issueQuicklookAlign={issueQuicklookAlign}
        initialOpen={initialOpen}
        onMouseEnter={onMouseEnter}
        onFocus={onFocus}
        onTouchStart={onTouchStart}
        onClickCapture={onClickCapture}
        {...props}
      >
        {children}
      </IssueLinkQuicklook>
    );
  }

  return (
    <RouterDom.Link
      ref={ref}
      to={to}
      state={prefetchedState}
      onMouseEnter={(event) => {
        armQuicklook(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        armQuicklook(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
      }}
      onClickCapture={(event) => {
        onClickCapture?.(event);
      }}
      {...props}
    >
      {children}
    </RouterDom.Link>
  );
});

export const Link = React.forwardRef<HTMLAnchorElement, CompanyLinkProps>(
  function CompanyLink({
    to,
    disableIssueQuicklook = false,
    issuePrefetch = null,
    issueQuicklookSide,
    issueQuicklookAlign,
    ...props
  }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    const resolvedTo = resolveTo(to, companyPrefix);
    const issuePathId = parseIssuePathIdFromPath(typeof resolvedTo === "string" ? resolvedTo : resolvedTo.pathname);

    if (issuePathId) {
      if (disableIssueQuicklook) {
        return <RouterDom.Link ref={ref} to={resolvedTo} {...props} />;
      }

      return (
        <LazyIssueLinkQuicklook
          ref={ref}
          to={resolvedTo}
          issuePathId={issuePathId}
          issuePrefetch={issuePrefetch}
          issueQuicklookSide={issueQuicklookSide}
          issueQuicklookAlign={issueQuicklookAlign}
          {...props}
        />
      );
    }

    return <RouterDom.Link ref={ref} to={resolvedTo} {...props} />;
  },
);

export const NavLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.NavLink>>(
  function CompanyNavLink({ to, ...props }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    return <RouterDom.NavLink ref={ref} to={resolveTo(to, companyPrefix)} {...props} />;
  },
);

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
