# Component Trees

## Form shell

```text
<form>
  <FieldGroup>
    <FieldSet>
      <FieldLegend />
      <FieldDescription />
      <FieldGroup>
        <Field>
          <FieldLabel />
          <InputGroup or Input />
          <FieldDescription />
          <FieldError />
        </Field>
      </FieldGroup>
    </FieldSet>
    <Field orientation="horizontal" className="justify-end">
      <Button />
    </Field>
  </FieldGroup>
</form>
```

## InputGroup

```text
<InputGroup>
  <InputGroupInput />
  <InputGroupAddon align="inline-start | inline-end | block-end">
    <InputGroupText or icon />
  </InputGroupAddon>
</InputGroup>
```

## Row list

```text
<ItemGroup>
  <Item variant="outline | default">
    <ItemMedia />
    <ItemContent>
      <ItemTitle />
      <ItemDescription />
    </ItemContent>
    <ItemActions />
  </Item>
</ItemGroup>
```

## Empty state

```text
<Empty>
  <EmptyHeader>
    <EmptyMedia />
    <EmptyTitle />
    <EmptyDescription />
  </EmptyHeader>
  <EmptyContent />
</Empty>
```

## Identity surface

```text
<Avatar>
  <AvatarImage />
  <AvatarFallback />
</Avatar>
```
