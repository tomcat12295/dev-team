import { describe, it, expect } from '@jest/globals';
import {
    canSendTo,
    canRequestApproval,
    canUpdateDashboard,
    PERMISSIONS,
} from '../config/permissions.js';
import { getAllRoles, getMemberRoles } from '../config/team-config.js';
import type { Role } from '../types/task.js';

describe('permissions', () => {
    const allRoles = getAllRoles() as Role[];

    describe('canSendTo', () => {
        describe('pm permissions', () => {
            it('pm can send to leader', () => {
                expect(canSendTo('pm', 'leader')).toBe(true);
            });

            it('pm cannot send to member-01', () => {
                expect(canSendTo('pm', 'member-01')).toBe(false);
            });

            it('pm cannot send to member-02', () => {
                expect(canSendTo('pm', 'member-02')).toBe(false);
            });

            it('pm cannot send to pm', () => {
                expect(canSendTo('pm', 'pm')).toBe(false);
            });
        });

        describe('leader permissions', () => {
            it('leader can send to pm', () => {
                expect(canSendTo('leader', 'pm')).toBe(true);
            });

            it('leader can send to member-01', () => {
                expect(canSendTo('leader', 'member-01')).toBe(true);
            });

            it('leader can send to member-02', () => {
                expect(canSendTo('leader', 'member-02')).toBe(true);
            });

            it('leader cannot send to leader', () => {
                expect(canSendTo('leader', 'leader')).toBe(false);
            });
        });

        // member permissions (dynamically generated)
        const memberRoles = getMemberRoles();
        memberRoles.forEach((memberRole) => {
            describe(`${memberRole} permissions`, () => {
                it(`${memberRole} can send to leader`, () => {
                    expect(canSendTo(memberRole as Role, 'leader')).toBe(true);
                });

                it(`${memberRole} cannot send to pm`, () => {
                    expect(canSendTo(memberRole as Role, 'pm')).toBe(false);
                });

                it(`${memberRole} cannot send to self`, () => {
                    expect(canSendTo(memberRole as Role, memberRole as Role)).toBe(false);
                });

                // 他メンバーへの送信不可
                memberRoles.filter(r => r !== memberRole).forEach((otherMember) => {
                    it(`${memberRole} cannot send to ${otherMember}`, () => {
                        expect(canSendTo(memberRole as Role, otherMember as Role)).toBe(false);
                    });
                });
            });
        });
    });

    describe('canRequestApproval', () => {
        it('pm can request approval', () => {
            expect(canRequestApproval('pm')).toBe(true);
        });

        it('leader cannot request approval', () => {
            expect(canRequestApproval('leader')).toBe(false);
        });

        it('member-01 cannot request approval', () => {
            expect(canRequestApproval('member-01')).toBe(false);
        });

        it('member-02 cannot request approval', () => {
            expect(canRequestApproval('member-02')).toBe(false);
        });

        it('only pm has approval permission', () => {
            const rolesWithApproval = allRoles.filter((role) => canRequestApproval(role));
            expect(rolesWithApproval).toEqual(['pm']);
        });
    });

    describe('canUpdateDashboard', () => {
        it('pm can update dashboard', () => {
            expect(canUpdateDashboard('pm')).toBe(true);
        });

        it('leader can update dashboard', () => {
            expect(canUpdateDashboard('leader')).toBe(true);
        });

        it('member-01 cannot update dashboard', () => {
            expect(canUpdateDashboard('member-01')).toBe(false);
        });

        it('member-02 cannot update dashboard', () => {
            expect(canUpdateDashboard('member-02')).toBe(false);
        });

        it('only pm and leader can update dashboard', () => {
            const rolesWithDashboard = allRoles.filter((role) => canUpdateDashboard(role));
            expect(rolesWithDashboard).toEqual(['pm', 'leader']);
        });
    });

    describe('PERMISSIONS object structure', () => {
        it('should have all roles defined', () => {
            expect(Object.keys(PERMISSIONS)).toEqual(allRoles);
        });

        it('each role should have all permission properties', () => {
            allRoles.forEach((role) => {
                expect(PERMISSIONS[role]).toHaveProperty('canSendTo');
                expect(PERMISSIONS[role]).toHaveProperty('canRequestApproval');
                expect(PERMISSIONS[role]).toHaveProperty('canUpdateDashboard');
            });
        });

        it('canSendTo should be an array for all roles', () => {
            allRoles.forEach((role) => {
                expect(Array.isArray(PERMISSIONS[role].canSendTo)).toBe(true);
            });
        });
    });

    describe('dynamic permission generation', () => {
        it('leader canSendTo should include all member roles', () => {
            const leaderCanSendTo = PERMISSIONS['leader'].canSendTo;
            const memberRoles = getMemberRoles();
            expect(leaderCanSendTo).toContain('pm');
            memberRoles.forEach((member) => {
                expect(leaderCanSendTo).toContain(member);
            });
        });

        it('all members should have same permission template', () => {
            const memberRoles = getMemberRoles();
            if (memberRoles.length < 2) {
                // Skip comparison if less than 2 members
                return;
            }

            const firstMemberPerms = PERMISSIONS[memberRoles[0] as Role];
            memberRoles.slice(1).forEach((member) => {
                const memberPerms = PERMISSIONS[member as Role];
                expect(memberPerms.canSendTo).toEqual(firstMemberPerms.canSendTo);
                expect(memberPerms.canRequestApproval).toEqual(firstMemberPerms.canRequestApproval);
                expect(memberPerms.canProcessApproval).toEqual(firstMemberPerms.canProcessApproval);
                expect(memberPerms.canUpdateDashboard).toEqual(firstMemberPerms.canUpdateDashboard);
            });
        });

        it('member permissions should match template from config', () => {
            const memberRoles = getMemberRoles();
            const firstMember = memberRoles[0] as Role;
            const memberPerms = PERMISSIONS[firstMember];

            // Check that member permissions follow the expected template
            expect(memberPerms.canSendTo).toEqual(['leader']);
            expect(memberPerms.canRequestApproval).toBe(false);
            expect(memberPerms.canProcessApproval).toBe(false);
            expect(memberPerms.canUpdateDashboard).toBe(false);
        });
    });
});
