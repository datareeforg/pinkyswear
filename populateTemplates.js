import { documentDB } from './db.js';
import { normalizeTemplateSchema, TEMPLATE_SCHEMA_VERSION } from './templateSchema.js';

// Kept as data, not UI logic, so the seed is deterministic and independently testable.
const rawDefaultTemplates = [
      {
        title: 'Service Agreement',
        content: `SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into on [DATE] between [COMPANY NAME] ("Provider") and the undersigned client ("Client").

1. SERVICES
Provider agrees to perform the following services:
- [DESCRIBE SERVICES]

2. COMPENSATION
Client agrees to pay Provider [AMOUNT] for the services. Payment terms are as follows:
- [PAYMENT TERMS]

3. TERM
This Agreement will commence on [START DATE] and continue until [END DATE] or until terminated by either party with [NOTICE PERIOD] written notice.

4. CONFIDENTIALITY
Both parties agree to keep confidential all proprietary information shared during the course of this Agreement.

5. SIGNATURES
By signing below, the parties agree to the terms and conditions of this Agreement.

Client Signature: _________________
Date: _________________

Provider Signature: _________________
Date: _________________`,
        category: 'business',
        description: 'Basic service agreement with customizable terms'
      },
      {
        title: 'Non-Disclosure Agreement',
        content: `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into on [DATE] between [PARTY A] and [PARTY B].

1. PURPOSE
The parties wish to engage in discussions regarding [PURPOSE OF DISCUSSIONS] during which confidential information may be disclosed.

2. CONFIDENTIAL INFORMATION
"Confidential Information" means any information disclosed by either party to the other party, either directly or indirectly, in writing, orally or by inspection of tangible objects, that is designated as "Confidential," "Proprietary" or some similar designation.

3. NON-DISCLOSURE
The Receiving Party agrees not to use any Confidential Information for any purpose except to evaluate and engage in discussions regarding a potential business relationship between the parties.

4. TERM
This Agreement will remain in effect for [TERM PERIOD] from the date of signing.

5. SIGNATURES
By signing below, the parties acknowledge their agreement to the terms above.

[PARTY A] Signature: _________________
Date: _________________

[PARTY B] Signature: _________________
Date: _________________`,
        category: 'legal',
        description: 'Standard NDA for protecting confidential information'
      },
      {
        title: 'Field Inspection Report',
        content: `FIELD INSPECTION REPORT

Property Address: _________________
Inspection Date: _________________
Inspector Name: _________________

1. GENERAL CONDITION
□ Excellent  □ Good  □ Fair  □ Poor

2. ITEMS INSPECTED
□ Exterior Structure
□ Interior Structure
□ Electrical Systems
□ Plumbing Systems
□ HVAC Systems
□ Other: _________________

3. FINDINGS
_________________
_________________
_________________

4. RECOMMENDED ACTIONS
_________________
_________________
_________________

5. PHOTOS
[Photo attachments will be added here]

6. SIGNATURES
Inspector Signature: _________________
Date: _________________

Client Signature: _________________
Date: _________________`,
        category: 'field',
        description: 'Template for field service inspections with photo attachments'
      },
      {
        title: 'Work Authorization',
        content: `WORK AUTHORIZATION

Date: _________________
Customer Name: _________________
Address: _________________
Phone: _________________

I, the undersigned customer, authorize [COMPANY NAME] to perform the following work:

DESCRIPTION OF WORK:
_________________
_________________
_________________

ESTIMATED COST: $_________________ (This is an estimate only, actual costs may vary)

PAYMENT TERMS:
_________________
_________________

I understand that I am responsible for payment for all services rendered and materials provided. By signing below, I authorize the above-described work.

Customer Signature: _________________
Date: _________________

Company Representative: _________________
Date: _________________`,
        category: 'business',
        description: 'Authorization form for work to be performed in the field'
      },
      {
        title: 'Equipment Rental Agreement',
        content: `EQUIPMENT RENTAL AGREEMENT

This Equipment Rental Agreement ("Agreement") is made on [DATE] between [RENTAL COMPANY] ("Owner") and [RENTER NAME] ("Renter").

1. EQUIPMENT
Owner agrees to rent to Renter the following equipment:
- [EQUIPMENT DESCRIPTION]
- Serial/Model Number: _________________
- Condition upon rental: _________________

2. RENTAL PERIOD
From: [START DATE] To: [END DATE]

3. RENTAL RATE
$_________ per [DAY/WEEK/MONTH]
Total estimated rental charges: $_________
Security deposit: $_________

4. RENTER RESPONSIBILITIES
Renter shall:
- Keep the equipment in good condition
- Use the equipment only for its intended purpose
- Return the equipment by the end of the rental period
- Be responsible for any damage beyond normal wear and tear

5. SIGNATURES
By signing below, the parties agree to the terms of this Agreement.

Renter Signature: _________________
Date: _________________

Owner Signature: _________________
Date: _________________`,
        category: 'business',
        description: 'Agreement for equipment rental with terms and conditions'
      },
      {
        title: 'Property Access Consent',
        content: `PROPERTY ACCESS CONSENT FORM

I, [PROPERTY OWNER NAME], being the legal owner of the property located at:

[PROPERTY ADDRESS]

hereby grant permission to [COMPANY/INDIVIDUAL NAME] and its authorized representatives to access my property for the purpose of:

[PURPOSE OF ACCESS]

This access is authorized for the following date(s) and time(s):
Date(s): _________________
Time(s): _________________

Special instructions or restrictions:
_________________
_________________

I understand that all reasonable care will be taken to minimize disruption and damage to my property. If any damage occurs, it will be documented and addressed appropriately.

By signing below, I confirm that I am authorized to grant this permission.

Property Owner Signature: _________________
Date: _________________

Company Representative: _________________
Date: _________________`,
        category: 'field',
        description: 'Consent form for accessing private property'
      },
      {
        title: 'Mobile App Development Agreement',
        content: `MOBILE APP DEVELOPMENT AGREEMENT

This Agreement is entered into on [DATE] between [DEVELOPER NAME] ("Developer") and [CLIENT NAME] ("Client").

1. PROJECT SCOPE
Developer agrees to design and develop a mobile application with the following specifications:
- Platform(s): [iOS/Android/Both]
- Key Features: [LIST FEATURES]
- Deliverables: [LIST DELIVERABLES]

2. INTELLECTUAL PROPERTY
Upon full payment, all rights, title, and interest in the mobile application, including source code, shall transfer to the Client. Developer retains the right to use the project as a portfolio piece.

3. TIMELINE AND MILESTONES
- Design Phase: [DATES]
- Development Phase: [DATES]
- Testing Phase: [DATES]
- Launch Date: [DATE]

4. COMPENSATION
Total Project Fee: $[AMOUNT]
Payment Schedule:
- 30% upfront: $[AMOUNT]
- 40% at development completion: $[AMOUNT]
- 30% at final delivery: $[AMOUNT]

5. MAINTENANCE AND SUPPORT
Developer will provide [NUMBER] days of post-launch support for bug fixes.

Client Signature: _________________
Date: _________________

Developer Signature: _________________
Date: _________________`,
        category: 'business',
        description: 'Agreement for mobile app development projects'
      },
      {
        title: 'Web Application License Agreement',
        content: `WEB APPLICATION LICENSE AGREEMENT

This License Agreement ("Agreement") is entered into on [DATE] between [LICENSOR NAME] ("Licensor") and [LICENSEE NAME] ("Licensee").

1. GRANT OF LICENSE
Licensor grants Licensee a [EXCLUSIVE/NON-EXCLUSIVE] license to use the web application titled "[APP NAME]" under the following terms.

2. LICENSE SCOPE
□ Single-user license
□ Multi-user license ([NUMBER] users)
□ Enterprise license (unlimited users)

3. PERMITTED USE
Licensee may use the application for:
- [DESCRIBE PERMITTED USES]

4. RESTRICTIONS
Licensee shall not:
- Reverse engineer, decompile, or disassemble the application
- Sublicense, rent, or lease the application
- Remove or modify copyright notices

5. LICENSE FEE
One-time fee: $[AMOUNT]
Annual maintenance (optional): $[AMOUNT]

6. TERM
This license is valid from [START DATE] to [END DATE] and may be renewed.

Licensee Signature: _________________
Date: _________________

Licensor Signature: _________________
Date: _________________`,
        category: 'legal',
        description: 'License agreement for web applications'
      },
      {
        title: 'Software IP Assignment Agreement',
        content: `INTELLECTUAL PROPERTY ASSIGNMENT AGREEMENT

This Agreement is made on [DATE] between [ASSIGNOR NAME] ("Assignor") and [ASSIGNEE NAME] ("Assignee").

1. WORK COVERED
This Agreement covers all intellectual property related to:
Project Name: [PROJECT NAME]
Description: [DESCRIPTION]

2. ASSIGNMENT
Assignor hereby assigns to Assignee all right, title, and interest in and to the Work, including:
- Copyright
- Patent rights
- Trade secrets
- Moral rights (to the extent assignable)

3. REPRESENTATIONS
Assignor represents that:
- They are the sole creator/owner of the Work
- The Work does not infringe on any third-party rights
- They have full authority to make this assignment

4. COMPENSATION
In consideration for this assignment, Assignee shall pay Assignor:
Amount: $[AMOUNT]
Payment terms: [TERMS]

5. FURTHER ASSURANCES
Assignor agrees to execute any additional documents necessary to perfect the assignment.

Assignor Signature: _________________
Date: _________________

Assignee Signature: _________________
Date: _________________`,
        category: 'legal',
        description: 'IP assignment for software and digital products'
      },
      {
        title: 'API Usage Agreement',
        content: `API USAGE AGREEMENT

This Agreement is entered into on [DATE] between [API PROVIDER] ("Provider") and [API USER] ("User").

1. API ACCESS
Provider grants User access to the following API:
API Name: [API NAME]
Version: [VERSION]
Documentation: [URL]

2. USAGE LIMITS
- Requests per day: [NUMBER]
- Requests per minute: [NUMBER]
- Data transfer limit: [AMOUNT]

3. PERMITTED USE
User may use the API for:
[DESCRIBE PERMITTED USES]

4. PROHIBITED USE
User shall not:
- Exceed rate limits
- Resell or redistribute API access
- Use the API for illegal purposes
- Attempt to reverse engineer the API

5. FEES
□ Free tier
□ Paid tier: $[AMOUNT] per month
□ Pay-per-use: $[AMOUNT] per [UNIT]

6. DATA PRIVACY
User agrees to comply with all applicable data protection laws when using the API.

User Signature: _________________
Date: _________________

Provider Signature: _________________
Date: _________________`,
        category: 'business',
        description: 'Agreement for API access and usage terms'
      },
      {
        title: 'Idea Submission Agreement',
        content: `IDEA SUBMISSION AGREEMENT

Date: [DATE]
Submitter: [SUBMITTER NAME]
Recipient: [COMPANY NAME]

1. IDEA DESCRIPTION
Title: [IDEA TITLE]
Category: [CATEGORY]

Brief Description:
_________________
_________________
_________________

2. SUBMISSION TERMS
Submitter understands and agrees that:
- This submission is voluntary and unsolicited
- No confidential relationship is created by this submission
- Recipient is free to use or not use the idea
- Recipient may already be working on similar ideas

3. NO OBLIGATION
Recipient has no obligation to:
- Review the submitted idea
- Keep the idea confidential
- Compensate Submitter for the idea
- Provide feedback on the idea

4. COMPENSATION (if applicable)
□ No compensation expected
□ Compensation to be negotiated if idea is used
□ Other: _________________

5. ACKNOWLEDGMENT
Submitter acknowledges that they have read and understood this Agreement and submit the idea with full knowledge of these terms.

Submitter Signature: _________________
Date: _________________

Recipient Signature: _________________
Date: _________________`,
        category: 'business',
        description: 'Agreement for submitting ideas to companies'
      },
      {
        title: 'Beta Testing Agreement',
        content: `BETA TESTING AGREEMENT

This Agreement is entered into on [DATE] between [COMPANY NAME] ("Company") and the undersigned Beta Tester ("Tester").

1. BETA PRODUCT
Product Name: [PRODUCT NAME]
Type: □ Mobile App  □ Web App  □ Software  □ Other: _______
Version: [VERSION]

2. TESTING PERIOD
Start Date: [DATE]
End Date: [DATE]

3. TESTER RESPONSIBILITIES
Tester agrees to:
- Test the product regularly during the testing period
- Report bugs, errors, and usability issues
- Provide constructive feedback
- Not distribute or share the beta product

4. CONFIDENTIALITY
Tester agrees to keep all information about the beta product confidential and not disclose it to third parties.

5. NO WARRANTY
The beta product is provided "as is" without warranty. Tester uses it at their own risk.

6. FEEDBACK LICENSE
Tester grants Company a perpetual license to use any feedback provided during testing.

7. COMPENSATION
□ No compensation
□ Free license upon release
□ Other: _________________

Tester Signature: _________________
Date: _________________

Company Representative: _________________
Date: _________________`,
        category: 'business',
        description: 'Agreement for beta testing software products'
      },
      {
        title: 'Open Source Contribution Agreement',
        content: `OPEN SOURCE CONTRIBUTION AGREEMENT

Project: [PROJECT NAME]
Contributor: [CONTRIBUTOR NAME]
Date: [DATE]

1. CONTRIBUTION
Contributor wishes to contribute the following to the Project:
Description: _________________
Type: □ Code  □ Documentation  □ Design  □ Other: _______

2. LICENSE GRANT
Contributor grants the Project a perpetual, worldwide, non-exclusive, royalty-free license to use, modify, and distribute the Contribution under the Project's open source license.

3. ORIGINAL WORK
Contributor certifies that:
- The Contribution is their original work
- They have the right to submit the Contribution
- The Contribution does not violate any third-party rights

4. PROJECT LICENSE
The Project is licensed under: [LICENSE NAME]
Contributor agrees that their Contribution will be subject to this license.

5. NO EMPLOYMENT
This Agreement does not create an employment or partnership relationship.

Contributor Signature: _________________
Date: _________________

Project Maintainer Signature: _________________
Date: _________________`,
        category: 'legal',
        description: 'Agreement for contributing to open source projects'
      },
      {
        title: 'SaaS Subscription Agreement',
        content: `SOFTWARE AS A SERVICE SUBSCRIPTION AGREEMENT

This Agreement is entered into on [DATE] between [PROVIDER NAME] ("Provider") and [SUBSCRIBER NAME] ("Subscriber").

1. SERVICE DESCRIPTION
Service Name: [SERVICE NAME]
Description: [BRIEF DESCRIPTION]

2. SUBSCRIPTION PLAN
□ Monthly: $[AMOUNT]/month
□ Annual: $[AMOUNT]/year
□ Enterprise: $[AMOUNT]/[PERIOD]

Features included:
- [FEATURE 1]
- [FEATURE 2]
- [FEATURE 3]

3. TERM AND RENEWAL
Initial term: [LENGTH]
Auto-renewal: □ Yes  □ No
Cancellation notice: [NUMBER] days

4. SERVICE LEVEL
Uptime guarantee: [PERCENTAGE]%
Support response time: [TIMEFRAME]

5. DATA AND PRIVACY
Provider will handle Subscriber data in accordance with its Privacy Policy and applicable data protection laws.

6. TERMINATION
Either party may terminate with [NUMBER] days written notice.

Subscriber Signature: _________________
Date: _________________

Provider Signature: _________________
Date: _________________`,
        category: 'business',
        description: 'Subscription agreement for SaaS products'
      },
      {
        title: 'Technology Partnership Agreement',
        content: `TECHNOLOGY PARTNERSHIP AGREEMENT

This Agreement is entered into on [DATE] between [PARTY A] and [PARTY B] (collectively, "Partners").

1. PARTNERSHIP PURPOSE
The Partners agree to collaborate on:
Project: [PROJECT NAME]
Objective: [OBJECTIVE]

2. ROLES AND RESPONSIBILITIES
[PARTY A] will:
- [RESPONSIBILITY 1]
- [RESPONSIBILITY 2]

[PARTY B] will:
- [RESPONSIBILITY 1]
- [RESPONSIBILITY 2]

3. INTELLECTUAL PROPERTY
Joint IP: Any IP created jointly shall be owned equally by both Partners.
Individual IP: Each Partner retains ownership of their pre-existing IP.

4. REVENUE SHARING
Revenue will be split:
[PARTY A]: [PERCENTAGE]%
[PARTY B]: [PERCENTAGE]%

5. CONFIDENTIALITY
Both parties agree to keep confidential all proprietary information shared during the partnership.

6. TERM
This partnership shall continue for [PERIOD] from the date of signing, unless terminated earlier by mutual agreement.

[PARTY A] Signature: _________________
Date: _________________

[PARTY B] Signature: _________________
Date: _________________`,
        category: 'business',
        description: 'Partnership agreement for technology collaborations'
      },
      {
        title: 'Data Reef Monitorium',
        content: `DATA REEF MONITORIUM

MONITORING SUMMARY
Report date: [REPORT DATE]
Prepared by: [PREPARED BY]
Environment or site: [ENVIRONMENT]
Monitoring period: [MONITORING PERIOD]

1. SYSTEM STATUS
Overall status: [OVERALL STATUS]
Systems or data sources monitored: [DATA SOURCES]
Thresholds or service targets: [MONITORING THRESHOLDS]

2. MONITORING READINGS
[MONITORING_READINGS]

3. ANOMALIES AND IMPACT
Observed anomalies: [ANOMALIES]
Affected systems, records, or users: [AFFECTED AREAS]
Impact assessment: [IMPACT]

4. FOLLOW-UP ACTIONS
[FOLLOW_UP_ACTIONS]

5. REVIEW AND ACKNOWLEDGMENT
Reviewer: [REVIEWER NAME]
Review date: [REVIEW DATE]
Reviewer Signature: _________________

This report records monitoring observations and follow-up actions. Confirm source data and interpretation before relying on the report.
`,
        category: 'field',
        description: 'Structured monitoring report for system health, data quality, anomalies, and follow-up actions'
      },
      {
        title: 'A to Zenith Template',
        content: `A TO ZENITH PROJECT TEMPLATE

INITIATIVE OVERVIEW
Project name: [PROJECT NAME]
Project owner: [PLAN OWNER]
Sponsor: [SPONSOR]
Start date: [START DATE]
Target completion date: [END DATE]

1. OUTCOME AND SCOPE
Desired outcome: [DESIRED OUTCOME]
In scope: [IN SCOPE]
Out of scope: [OUT OF SCOPE]
Success measures: [SUCCESS MEASURES]

2. PROJECT PHASES
[PROJECT_PHASES]

3. PEOPLE AND DEPENDENCIES
Core stakeholders: [STAKEHOLDERS]
Key dependencies: [DEPENDENCIES]
Resources or budget assumptions: [RESOURCES AND BUDGET]

4. RISKS AND DECISIONS
Known risks: [RISKS]
Open decisions: [OPEN DECISIONS]
Escalation contact: [ESCALATION CONTACT]

5. APPROVAL
Approval notes: [APPROVAL NOTES]
Project owner signature: _________________
Date: [APPROVAL DATE]
Sponsor signature: _________________
Date: [SPONSOR APPROVAL DATE]
`,
        category: 'business',
        description: 'End-to-end project plan from kickoff through delivery and approval'
      },
      {
        title: 'Omega Mega Corp',
        content: `OMEGA MEGA CORP SERVICE ENGAGEMENT

ENGAGEMENT DETAILS
Effective date: [EFFECTIVE DATE]
Omega Mega Corp business unit: [OMEGA BUSINESS UNIT]
Counterparty: [COUNTERPARTY NAME]
Counterparty contact: [COUNTERPARTY CONTACT]
Engagement owner: [ENGAGEMENT OWNER]

1. PURPOSE AND SCOPE
Business objective: [BUSINESS OBJECTIVE]
Services requested: [SERVICE_DELIVERABLES]
Out-of-scope items: [OUT OF SCOPE]
Locations or systems involved: [LOCATIONS OR SYSTEMS]

2. DELIVERY AND ACCEPTANCE
Target start date: [START DATE]
Target end date: [END DATE]
Delivery milestones: [MILESTONES]
Review and acceptance contact: [ACCEPTANCE CONTACT]

3. COMMERCIAL DETAILS
Fee or budget: [FEE OR BUDGET]
Payment schedule: [PAYMENT SCHEDULE]
Expense assumptions: [EXPENSE ASSUMPTIONS]

4. OPERATIONAL NOTES
Confidential or restricted information: [RESTRICTED INFORMATION]
Security or access requirements: [SECURITY REQUIREMENTS]
Open issues and dependencies: [OPEN ISSUES]

5. REVIEW AND SIGN-OFF
Omega Mega Corp representative: [OMEGA REPRESENTATIVE]
Counterparty representative: [COUNTERPARTY REPRESENTATIVE]
Omega Mega Corp signature: _________________
Date: [OMEGA SIGNATURE DATE]
Counterparty signature: _________________
Date: [COUNTERPARTY SIGNATURE DATE]

This template captures engagement details for review. Confirm commercial and legal terms with the appropriate reviewers before signing.
`,
        category: 'business',
        description: 'Corporate service engagement template for scope, delivery, commercial details, and approvals'
      }
];

export const defaultTemplates = rawDefaultTemplates.map(normalizeTemplateSchema);

export async function seedDefaultTemplates() {
  const inserted = await documentDB.seedTemplates(defaultTemplates, '2026-10');
  const stored = await documentDB.getTemplates();
  for (const template of stored) {
    if (Number(template.schemaVersion) >= TEMPLATE_SCHEMA_VERSION) continue;
    await documentDB.updateTemplateSchema(template.id, template);
  }
  if (inserted > 0) {
    await documentDB.saveAudit({
      eventType: 'templates.initialized',
      actor: 'system',
      objectType: 'templates',
      objectId: null,
      metadata: { inserted, available: defaultTemplates.length }
    });
  }
  return inserted;
}
