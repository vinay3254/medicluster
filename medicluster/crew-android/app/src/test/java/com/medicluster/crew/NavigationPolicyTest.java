package com.medicluster.crew;

import org.junit.Test;
import static org.junit.Assert.*;

public class NavigationPolicyTest {
    private static final String ORIGIN = "http://localhost:5174";
    private final NavigationPolicy policy = new NavigationPolicy(ORIGIN);

    @Test public void opensOnlyLiveCrewRoutes() {
        assertTrue(policy.isCrewPage(ORIGIN + "/#/driver/login"));
        assertTrue(policy.isCrewPage(ORIGIN + "/#/driver"));
        assertTrue(policy.isCrewPage(ORIGIN + ":443/#/driver"));
    }
    @Test public void excludesDispatcherPagesAndServerRoutes() {
        for (String path : new String[]{"/", "/#/", "/#/login", "/#/driver-extra", "/#/driver/secret", "/api", "/api#/driver", "/download#/driver", "/?redirect=evil#/driver", "/#%2Fdriver", "//other/#/driver"})
            assertFalse(path, policy.isCrewPage(ORIGIN + path));
    }
    @Test public void blocksUntrustedHostsPortsAndSchemes() {
        for (String url : new String[]{"http://medicluster-dispatch-dix1.onrender.com/#/driver", ORIGIN + ".evil.test/#/driver", "https://medicluster-dispatch-dix1.onrender.com@evil.test/#/driver", "https://user:password@medicluster-dispatch-dix1.onrender.com/#/driver", ORIGIN + ":444/#/driver", "javascript:alert(1)", "file:///driver", "intent://driver", "https://[", "", null})
            assertFalse(String.valueOf(url), policy.isCrewPage(url));
    }
    @Test public void identifiesExactPermissionOrigin() {
        assertTrue(policy.isTrustedOrigin(ORIGIN));
        assertTrue(policy.isTrustedOrigin(ORIGIN + "/"));
        assertTrue(policy.isTrustedOrigin(ORIGIN + ":443"));
        assertFalse(policy.isTrustedOrigin(ORIGIN + "/path"));
        assertFalse(policy.isTrustedOrigin(ORIGIN + "?x=y"));
        assertFalse(policy.isTrustedOrigin(ORIGIN + "#fragment"));
        assertFalse(policy.isTrustedOrigin(ORIGIN + ".evil.test"));
    }
    @Test public void locationRequiresBothTrustedOriginAndCurrentCrewPage() {
        assertTrue(policy.canUseLocation(ORIGIN, ORIGIN + "/#/driver"));
        assertFalse(policy.canUseLocation("https://evil.test", ORIGIN + "/#/driver"));
        assertFalse(policy.canUseLocation(ORIGIN, ORIGIN + "/#/login"));
        assertFalse(policy.canUseLocation(ORIGIN, null));
    }
    @Test public void phoneAndExternalHttpsLinksLeaveApp() {
        assertTrue(policy.isExternalLink("tel:+917975353938"));
        assertTrue(policy.isExternalLink("https://www.google.com/maps/dir/?api=1&destination=12.9,77.6"));
        assertTrue(policy.isExternalLink("https://medicluster-wiu3.onrender.com/login"));
        assertFalse(policy.isExternalLink(ORIGIN + "/#/login"));
        assertFalse(policy.isExternalLink("https://user:pass@evil.test"));
        assertFalse(policy.isExternalLink("javascript:alert(1)"));
        assertFalse(policy.isExternalLink("intent://other"));
        assertFalse(policy.isExternalLink("http://insecure.test"));
        assertFalse(policy.isExternalLink("tel:+91;intent=evil"));
    }
}
