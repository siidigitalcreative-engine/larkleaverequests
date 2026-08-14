# Leave Requests

Separate Next.js 14 leave-request app aligned with the existing Lark Attendance UI.

## Existing Employees table

Add this field to the existing Employees table:

- `Leave Approval Group` — Single Select

Use these official values:

### Office
- Creative
- Digital Creative
- E-commerce
- Finance
- HR
- Logistics
- Marketing
- Purchasing
- Sales
- HOD

### Warehouse
- Warehouse

### Promodiser
- SM Promodiser
- Landmark Promodiser

The app continues to reuse:
- Employee ID
- Full Name
- Department
- Mobile Number
- Active

## Leave Requests table

Create these exact fields:

- Leave Request ID — Single Line Text
- Employee ID — Single Line Text
- Employee Name — Single Line Text
- Department — Single Line Text
- Approval Group — Single Select
- Leave Type — Single Select
- Start Date — Date
- End Date — Date
- Day Type — Single Select (`Full Day`, `Partial Day`)
- Start Time — Single Line Text
- End Time — Single Line Text
- Reason — Long Text
- Notify — Multiple Select
- Attachment — Attachment
- Status — Single Select (`Pending`, `Approved`, `Rejected`)
- Submitted At — Date/Time
- Approved By — Single Line Text
- Approved At — Date/Time
- Rejection Reason — Long Text

## Leave Approvers table

For internal or external approvers:

- Name — Single Line Text
- Mobile Number — Single Line Text
- Approval Group — Multiple Select
- Active — Checkbox

An approver can only process requests for a group listed in their `Approval Group`.

## Notify Contacts table

For optional direct Lark notifications:

- Name — Single Line Text
- Open ID — Single Line Text
- Active — Checkbox

If Lark does not allow the app to message a particular external contact, the leave request still succeeds and the app reports that notification as undelivered.

## Approval group webhooks

Create a custom bot in each approval group and add its webhook to Vercel.

Use these webhook environment variables:

### Office
- Creative → `LARK_LEAVE_WEBHOOK_CREATIVE`
- Digital Creative → `LARK_LEAVE_WEBHOOK_DIGITAL_CREATIVE`
- E-commerce → `LARK_LEAVE_WEBHOOK_E_COMMERCE`
- Finance → `LARK_LEAVE_WEBHOOK_FINANCE`
- HR → `LARK_LEAVE_WEBHOOK_HR`
- Logistics → `LARK_LEAVE_WEBHOOK_LOGISTICS`
- Marketing → `LARK_LEAVE_WEBHOOK_MARKETING`
- Purchasing → `LARK_LEAVE_WEBHOOK_PURCHASING`
- Sales → `LARK_LEAVE_WEBHOOK_SALES`
- HOD → `LARK_LEAVE_WEBHOOK_HOD`

### Warehouse
- Warehouse → `LARK_LEAVE_WEBHOOK_WAREHOUSE`

### Promodiser
- SM Promodiser → `LARK_LEAVE_WEBHOOK_SM_PROMODISER`
- Landmark Promodiser → `LARK_LEAVE_WEBHOOK_LANDMARK_PROMODISER`

## Flow

1. Employee verifies identity using the existing Employees table.
2. Employee submits leave.
3. Leave request is saved to Lark Base.
4. Card is posted to the employee's assigned Leave Approval Group.
5. Approve / Reject button opens a signed review page.
6. Reviewer verifies with Name + Mobile from Leave Approvers.
7. Base record is updated.
8. A status card is posted to the same group.
9. Optional Notify contacts receive a direct Lark message when possible.
